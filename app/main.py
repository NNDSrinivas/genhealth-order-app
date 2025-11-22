"""
Entry point for the FastAPI application.

This module defines the REST API routes for managing orders, uploading and
parsing documents for patient information, and logging all user activity.

The API includes CRUD operations on an `Order` resource and an endpoint
for uploading a document and extracting the patient's first name,
last name and date of birth. All incoming requests are logged to the
database via a middleware component.

It also implements a hybrid extraction strategy:
1) Fast text extraction for PDFs, DOCX, TXT
2) OCR fallback (Tesseract) for scanned / faxed PDFs with no embedded text
"""

import os
import re
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import database, models, schemas

# Ensure the database tables are created at application startup.
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Order and Document Processing API")

# ---------------------------------------------------------------------------
# CORS configuration
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for local dev / simple deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Middleware for activity logging
# ---------------------------------------------------------------------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Middleware that logs each incoming request to the database.

    It captures the HTTP method, path, status code, client IP and
    request details. It stores this information in the ActivityLog table.
    """
    # Skip logging for certain paths to avoid noise and refresh issues
    # Only skip GET requests to these paths to avoid logging refresh operations
    skip_paths = ["/activity-logs", "/deleted-orders"]
    path = request.url.path
    
    # Skip GET requests to certain paths and static assets
    if ((path in skip_paths and request.method == "GET") or 
        path == "/" or 
        path.startswith("/assets/") or 
        path.startswith("/favicon") or
        (path == "/orders" and request.method == "GET")):
        return await call_next(request)
    
    response = await call_next(request)
    
    # Generate meaningful request details based on the endpoint
    body_content = ""
    if request.method == "POST":
        if "/extract/patient-info" in path:
            body_content = "Document upload for patient info extraction"
        elif "/orders" in path:
            body_content = "New order creation request"
        else:
            content_type = request.headers.get("content-type", "")
            if "multipart/form-data" in content_type:
                body_content = "File upload request"
            elif "application/json" in content_type:
                body_content = "JSON API request"
            else:
                body_content = f"Request with content-type: {content_type}"
    elif request.method == "DELETE":
        body_content = f"Delete operation on {path}"
    elif request.method == "PUT":
        body_content = f"Update operation on {path}"

    try:
        db = database.SessionLocal()
        log_entry = models.ActivityLog(
            method=request.method,
            path=str(request.url.path),
            status_code=response.status_code,
            ip_address=request.client.host if request.client else None,
            body=body_content,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"Failed to log request: {e}")
    finally:
        db.close()

    return response


def get_db():
    """Dependency injection for SQLAlchemy session."""
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Order CRUD endpoints
# ---------------------------------------------------------------------------

@app.post("/orders", response_model=schemas.Order)
def create_order(order: schemas.OrderCreate, db: Session = Depends(get_db)):
    """
    Create a new order with the provided data.
    """
    db_order = models.Order(**order.dict())
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order


@app.get("/orders", response_model=List[schemas.Order])
def list_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieve a list of orders with optional pagination.
    """
    return (
        db.query(models.Order)
        .order_by(models.Order.id)
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.get("/orders/{order_id}", response_model=schemas.Order)
def get_order(order_id: int, db: Session = Depends(get_db)):
    """
    Retrieve a single order by its identifier.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.put("/orders/{order_id}", response_model=schemas.Order)
def update_order(
    order_id: int, updated: schemas.OrderCreate, db: Session = Depends(get_db)
):
    """
    Update an existing order's details.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    for field, value in updated.dict().items():
        setattr(order, field, value)

    db.commit()
    db.refresh(order)
    return order


@app.delete("/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """
    Delete an order by ID and store a snapshot in DeletedOrder for history.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    deleted = models.DeletedOrder(
        original_order_id=order.id,
        first_name=order.first_name,
        last_name=order.last_name,
        date_of_birth=order.date_of_birth,
        description=order.description,
    )
    db.add(deleted)
    db.delete(order)
    db.commit()
    return {"detail": f"Order {order_id} deleted"}


@app.get("/deleted-orders", response_model=List[schemas.DeletedOrder])
def list_deleted_orders(limit: int = 20, db: Session = Depends(get_db)):
    """
    List recently deleted orders for UI history.
    """
    return (
        db.query(models.DeletedOrder)
        .order_by(models.DeletedOrder.deleted_at.desc())
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Activity log endpoint (for UI visibility)
# ---------------------------------------------------------------------------

@app.get("/activity-logs", response_model=List[schemas.ActivityLog])
def list_activity_logs(
    limit: int = 50,
    only_api: bool = True,
    db: Session = Depends(get_db),
):
    """
    Return the most recent activity logs.

    By default, only_api=True filters out static asset requests so this view
    focuses on user/API activity.
    """
    from sqlalchemy import not_
    
    query = db.query(models.ActivityLog).order_by(models.ActivityLog.id.desc())

    if only_api:
        query = query.filter(
            not_(models.ActivityLog.path.like("/assets%")),
            models.ActivityLog.path != "/",
            not_(models.ActivityLog.path.like("/favicon%")),
        )

    return query.limit(limit).all()


# ---------------------------------------------------------------------------
# Document upload & extraction
# ---------------------------------------------------------------------------

def _ocr_pdf_with_tesseract(temp_path: str) -> str:
    """
    Perform OCR on a PDF using pdf2image + Tesseract (pytesseract).

    This is used as a fallback when PyPDF2 cannot extract any text (e.g.
    faxed / scanned PDFs). It assumes Tesseract and Poppler are installed
    on the host system.
    """
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "OCR dependencies are not installed. To enable OCR for scanned PDFs, "
                "please install 'pdf2image' and 'pytesseract' Python packages, and "
                "system packages 'tesseract-ocr' and 'poppler-utils'."
            ),
        ) from exc

    text = ""
    # convert_from_path returns a list of PIL images (one per page)
    pages = convert_from_path(temp_path)
    for img in pages:
        page_text = pytesseract.image_to_string(img) or ""
        text += "\n" + page_text

    return " ".join(text.split())


def _extract_text_from_file(temp_path: str, ocr_enabled: bool = True) -> tuple[str, bool]:
    """
    Extract raw text from a file based on its extension.

    Supports:
    - PDF (using PyPDF2, with OCR fallback if needed)
    - DOCX (using python-docx)
    - Plain text files (.txt, .csv, .log, etc.)

    Returns tuple of (text, used_ocr_flag)
    """
    path = Path(temp_path)
    suffixes = [s.lower() for s in path.suffixes]
    ext = "".join(suffixes) or path.suffix.lower()

    text = ""
    used_ocr = False

    if ".pdf" in ext:
        from PyPDF2 import PdfReader

        reader = PdfReader(temp_path)
        for page in reader.pages:
            page_text = page.extract_text() or ""
            text += "\n" + page_text

        # If no text was found and OCR is enabled, fall back to OCR.
        if not text.strip() and ocr_enabled:
            text = _ocr_pdf_with_tesseract(temp_path)
            used_ocr = True
        elif not text.strip():
            # OCR disabled and no text found
            raise HTTPException(
                status_code=422,
                detail="PDF contains no extractable text. Enable OCR fallback to process scanned documents."
            )

    elif ext.endswith(".docx"):
        from docx import Document  # python-docx

        doc = Document(temp_path)
        for para in doc.paragraphs:
            if para.text:
                text += "\n" + para.text

    else:
        # Treat as plain text
        with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

    return " ".join(text.split()), used_ocr


@app.post("/extract/patient-info", response_model=schemas.PatientInfo)
async def extract_patient_info(
    file: UploadFile = File(...),
    ocr_enabled: bool = Form(True),
    db: Session = Depends(get_db)
):
    """
    Extract patient information from an uploaded document.

    The endpoint accepts a multipart/form-data POST request containing a file
    and an optional ocr_enabled parameter. It reads the document (PDF / DOCX / TXT), 
    searches the text for patterns that look like a first name, last name and date 
    of birth and returns these values. In addition, it stores the extracted 
    information as a new order in the database for convenience.

    For PDFs with no embedded text (e.g. faxed/scanned PDFs), it falls back
    to an OCR pipeline using Tesseract if OCR is enabled.
    """
    temp_dir = "/tmp"
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, file.filename)

    with open(temp_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[str] = None
    used_ocr = False

    try:
        normalized, used_ocr = _extract_text_from_file(temp_path, ocr_enabled)

        # 1) Prefer "Patient Name: First Last"
        full_name_pattern = re.compile(
            r"Patient\s+Name\s*[:\-]\s*([A-Za-z'\-]+)\s+([A-Za-z'\-]+)",
            re.IGNORECASE,
        )
        full_name_match = full_name_pattern.search(normalized)

        if full_name_match:
            first_name = full_name_match.group(1)
            last_name = full_name_match.group(2)
        else:
            # 2) Fallback: separate First Name / Last Name fields
            first_pattern = re.compile(
                r"First\s*Name\s*[:\-]\s*([A-Za-z'\-]+)", re.IGNORECASE
            )
            last_pattern = re.compile(
                r"Last\s*Name\s*[:\-]\s*([A-Za-z'\-]+)", re.IGNORECASE
            )

            first_match = first_pattern.search(normalized)
            last_match = last_pattern.search(normalized)

            if first_match:
                candidate = first_match.group(1)
                # avoid garbage like "and"
                if candidate.lower() not in {"and", "name", "address"}:
                    first_name = candidate

            if last_match:
                last_name = last_match.group(1)

        dob_pattern = re.compile(
            r"(?:DOB|Date\s*of\s*Birth|Birth\s*Date|Birthdate)\s*[:\-]?\s*(\d{1,2}/\d{1,2}/\d{2,4})",
            re.IGNORECASE,
        )
        dob_match = dob_pattern.search(normalized)
        if dob_match:
            dob = dob_match.group(1)

        # ---- Address & phone extraction ----
        addr_pattern = re.compile(
            r"(?:Address|Patient\s+Address)\s*[:\-]\s*([^\n\r]+?)(?=\s*(?:Phone|Tel|Telephone|Medical|$))", re.IGNORECASE
        )
        phone_pattern = re.compile(
            r"(?:Phone|Tel|Telephone)\s*[:\-]\s*([\+\d\-\(\)\s]+)", re.IGNORECASE
        )

        address: Optional[str] = None
        phone: Optional[str] = None

        addr_match = addr_pattern.search(normalized)
        if addr_match:
            address = addr_match.group(1).strip()

        phone_match = phone_pattern.search(normalized)
        if phone_match:
            phone = phone_match.group(1).strip()

        # Build a rich description string that captures all details
        desc_parts = ["Auto-created from uploaded document"]
        full_name_str = " ".join(
            part for part in [first_name, last_name] if part
        ).strip()
        if full_name_str:
            desc_parts.append(f"Patient: {full_name_str}")
        if dob:
            desc_parts.append(f"DOB: {dob}")
        if address:
            desc_parts.append(f"Address: {address}")
        if phone:
            desc_parts.append(f"Phone: {phone}")
        if used_ocr:
            desc_parts.append("Source: OCR fallback")

        # Note: We only extract info here, don't auto-create orders
        # Users must manually click "Create Order" to save to database
    finally:
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass

    return schemas.PatientInfo(
        first_name=first_name,
        last_name=last_name,
        date_of_birth=dob,
        address=address,
        phone=phone,
        used_ocr=used_ocr,
    )


# Serve compiled frontend assets if the `static` directory exists. When the
# React application is built (e.g. via `npm run build`), its output can be
# placed in `app/static`. Mounting it here means both the API and UI are
# accessible from the same base URL. This MUST come after all API routes.
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")