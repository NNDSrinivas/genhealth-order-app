"""
Entry point for the FastAPI application.

This module defines the REST API routes for managing orders, uploading and
parsing documents for patient information, and logging all user activity.

The API includes CRUD operations on an `Order` resource and an endpoint
for uploading a document and extracting the patient's first name,
last name and date of birth. All incoming requests are logged to the
database via a middleware component.
"""

import os
import re
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from . import database, models, schemas

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
    request body. It stores this information in the ActivityLog table.
    """
    body_bytes = await request.body()
    response = await call_next(request)

    try:
        db = database.SessionLocal()
        log_entry = models.ActivityLog(
            method=request.method,
            path=str(request.url.path),
            status_code=response.status_code,
            ip_address=request.client.host if request.client else None,
            body=body_bytes.decode("utf-8", errors="ignore"),
        )
        db.add(log_entry)
        db.commit()
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
    Delete an order by ID.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    db.delete(order)
    db.commit()
    return {"detail": f"Order {order_id} deleted"}


# ---------------------------------------------------------------------------
# Activity log endpoint (for UI visibility)
# ---------------------------------------------------------------------------

@app.get("/activity-logs", response_model=List[schemas.ActivityLog])
def list_activity_logs(limit: int = 20, db: Session = Depends(get_db)):
    """
    Return the most recent activity logs.
    """
    return (
        db.query(models.ActivityLog)
        .order_by(models.ActivityLog.id.desc())
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Document upload & extraction
# ---------------------------------------------------------------------------

def _extract_text_from_file(temp_path: str) -> str:
    """
    Extract raw text from a file based on its extension.

    Supports:
    - PDF (using PyPDF2)
    - DOCX (using python-docx)
    - Plain text files (.txt, .csv, .log, etc.)

    Scanned PDFs with no embedded text will return an empty string; the caller
    can decide how to handle that (e.g., return a helpful message about OCR).
    """
    path = Path(temp_path)
    suffixes = [s.lower() for s in path.suffixes]
    ext = "".join(suffixes) or path.suffix.lower()

    text = ""

    if ".pdf" in ext:
        from PyPDF2 import PdfReader

        reader = PdfReader(temp_path)
        for page in reader.pages:
            page_text = page.extract_text() or ""
            text += "\n" + page_text

    elif ext.endswith(".docx"):
        from docx import Document  # python-docx

        doc = Document(temp_path)
        for para in doc.paragraphs:
            if para.text:
                text += "\n" + para.text

    else:
        # treat as plain text
        with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

    return " ".join(text.split())


@app.post("/extract/patient-info", response_model=schemas.PatientInfo)
async def extract_patient_info(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    """
    Extract patient information from an uploaded document.

    The endpoint accepts a multipart/form-data POST request containing a file.
    It reads the document, searches the text for patterns that look like a
    first name, last name and date of birth and returns these values.
    In addition, it stores the extracted information as a new order in the
    database for convenience.
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

    try:
        normalized = _extract_text_from_file(temp_path)

        if not normalized.strip():
            # Most likely a scanned / faxed PDF with no selectable text.
            # In a real system we'd kick this to an OCR pipeline.
            raise HTTPException(
                status_code=422,
                detail="Document contains no extractable text (likely a scanned PDF). "
                "OCR would be required to extract patient details.",
            )

        # Patterns for first name, last name, and DOB
        first_pattern = re.compile(
            r"(?:First\s*Name|FirstName|Patient\s*Name)\s*[:\-]?\s*([A-Za-z'\-]+)",
            re.IGNORECASE,
        )
        last_pattern = re.compile(
            r"(?:Last\s*Name|LastName)\s*[:\-]?\s*([A-Za-z'\-]+)",
            re.IGNORECASE,
        )
        dob_pattern = re.compile(
            r"(?:DOB|Date\s*of\s*Birth|Birth\s*Date|Birthdate)\s*[:\-]?\s*(\d{1,2}/\d{1,2}/\d{2,4})",
            re.IGNORECASE,
        )

        first_match = first_pattern.search(normalized)
        last_match = last_pattern.search(normalized)
        dob_match = dob_pattern.search(normalized)

        if first_match:
            first_name = first_match.group(1)
        if last_match:
            last_name = last_match.group(1)
        if dob_match:
            dob = dob_match.group(1)

        extracted_order = models.Order(
            first_name=first_name,
            last_name=last_name,
            date_of_birth=dob,
            description="Auto-created from uploaded document",
        )
        db.add(extracted_order)
        db.commit()
        db.refresh(extracted_order)
    finally:
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass

    return schemas.PatientInfo(
        first_name=first_name, last_name=last_name, date_of_birth=dob
    )


# Serve compiled frontend assets if the `static` directory exists. When the
# React application is built (e.g. via `npm run build`), its output can be
# placed in `app/static`. Mounting it here means both the API and UI are
# accessible from the same base URL. This MUST come after all API routes.
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")