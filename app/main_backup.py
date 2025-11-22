"""
Entry point for the FastAPI application.

This module defines the REST API routes for managing orders, uploading and
parsing documents for patient information, and logging all user activity.

The API includes CRUD operations on an `Order` resource and an endpoint
for uploading a PDF document and extracting the patient's first name,
last name and date of birth. All incoming requests are logged to the
database via a middleware component.
"""

import os
import re
from pathlib import Path
from typing import List

from fastapi import Depends, FastAPI, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session
from fastapi.staticfiles import StaticFiles

from . import database, models, schemas

# Ensure the database tables are created at application startup. In larger
# applications you might prefer to use Alembic migrations instead of
# automatic table creation.
models.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="Order and Document Processing API")

# ---------------------------------------------------------------------------
# CORS configuration
#
# The frontend runs on a different port (e.g. http://localhost:5173) which
# would otherwise be blocked by the browser's same‑origin policy. By
# configuring CORS here we explicitly allow requests from the frontend to
# reach the API. For production you may wish to limit `allow_origins` to
# specific trusted domains instead of `"*"`.
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files will be mounted after API routes are defined


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Middleware that logs each incoming request to the database.

    It captures the HTTP method, path, status code, client IP and
    request body. It stores this information in the ActivityLog table.
    """
    # Read the body once here. If we were to read the body in an endpoint
    # after this middleware runs, it would no longer be available. FastAPI
    # reads the body for us once we call request.body().
    body_bytes = await request.body()
    response = await call_next(request)

    # Persist log entry to the database. A dedicated session is used here
    # rather than the dependency-injected session to avoid interfering with
    # endpoint transactions.
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


@app.post("/orders", response_model=schemas.Order)
def create_order(order: schemas.OrderCreate, db: Session = Depends(get_db)):
    """
    Create a new order with the provided data.

    The order may include the patient's first name, last name, date of birth
    and an optional description. Additional fields can be added as needed.
    """
    db_order = models.Order(**order.dict())
    db.add(db_order)
    db.commit()
    db.refresh(db_order)
    return db_order


@app.get("/orders", response_model=List[schemas.Order])
def read_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """
    Retrieve a list of orders.

    Supports pagination via `skip` and `limit` query parameters.
    """
    orders = db.query(models.Order).offset(skip).limit(limit).all()
    return orders


@app.get("/orders/{order_id}", response_model=schemas.Order)
def read_order(order_id: int, db: Session = Depends(get_db)):
    """Retrieve a single order by its ID."""
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@app.put("/orders/{order_id}", response_model=schemas.Order)
def update_order(order_id: int, order_update: schemas.OrderUpdate, db: Session = Depends(get_db)):
    """Update an existing order partially or fully."""
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    update_data = order_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(order, field, value)
    db.commit()
    db.refresh(order)
    return order


@app.delete("/orders/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """Delete an order by its ID."""
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(order)
    db.commit()
    return {"detail": "Order deleted"}


@app.post("/extract/patient-info", response_model=schemas.PatientInfo)
async def extract_patient_info(
    file: UploadFile = File(...), db: Session = Depends(get_db)
):
    """
    Extract patient information from an uploaded PDF document.

    The endpoint accepts a multipart/form-data POST request containing a file.
    It reads the PDF using PyPDF2, searches the text for patterns that look
    like a first name, last name and date of birth and returns these values.
    In addition, it stores the extracted information as a new order in the
    database for convenience.
    """
    # Persist the uploaded file to a temporary location. PyPDF2 expects a
    # file-like object so saving it to disk makes processing straightforward.
    temp_dir = "/tmp"
    temp_path = os.path.join(temp_dir, file.filename)
    with open(temp_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    first_name = last_name = dob = None

    def extract_text(file_path: str) -> str:
        """
        Extract text from supported file types.

        Supports PDF, plain text (.txt, .csv) and DOCX files. Raises an
        HTTPException for unsupported types or parsing errors.
        """
        ext = Path(file_path).suffix.lower()
        # Plain text formats
        if ext in {".txt", ".csv"}:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        # PDF extraction
        if ext == ".pdf":
            try:
                from PyPDF2 import PdfReader
                reader = PdfReader(file_path)
                text = ""
                for page in reader.pages:
                    page_text = page.extract_text() or ""
                    text += "\n" + page_text
                return text
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Failed to parse PDF: {exc}")
        # DOCX extraction
        if ext == ".docx":
            try:
                from docx import Document
                document = Document(file_path)
                return "\n".join([para.text for para in document.paragraphs])
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"Failed to parse DOCX: {exc}")
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    try:
        # Determine text from uploaded file
        text_content = extract_text(temp_path)
        normalized = " ".join(text_content.split())

        # Regex patterns for first name, last name and date of birth
        first_pattern = re.compile(
            r"(?:First\s*Name|FirstName)\s*[:\-]?\s*([A-Za-z'\-]+)", re.IGNORECASE
        )
        last_pattern = re.compile(
            r"(?:Last\s*Name|LastName)\s*[:\-]?\s*([A-Za-z'\-]+)", re.IGNORECASE
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

        # Insert extracted info into the database even if some fields are missing
        extracted_order = models.Order(
            first_name=first_name, last_name=last_name, date_of_birth=dob
        )
        db.add(extracted_order)
        db.commit()
        db.refresh(extracted_order)
    finally:
        # Ensure temporary file is removed
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass

    return schemas.PatientInfo(first_name=first_name, last_name=last_name, date_of_birth=dob)


# Serve compiled frontend assets if the `static` directory exists. When the
# React application is built (e.g. via `npm run build`), its output can be
# placed in `app/static`. Mounting it here means both the API and UI are
# accessible from the same base URL. This MUST come after all API routes.
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")