"""
Pydantic models used for request validation and response formatting.

These schemas define the shapes of the data we accept from the client and
the data we return. Using separate schemas helps decouple the API layer
from the persistence layer and allows FastAPI to automatically generate
OpenAPI documentation.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class OrderBase(BaseModel):
    """Fields common to order create and update requests."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    description: Optional[str] = None


class OrderCreate(OrderBase):
    """Schema for creating a new order."""

    pass


class OrderUpdate(OrderBase):
    """Schema for updating an existing order.

    All fields are optional to support partial updates.
    """

    pass


class Order(OrderBase):
    """Schema returned when reading an order from the API."""

    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActivityLog(BaseModel):
    """Schema returned for an activity log entry."""

    id: int
    method: str
    path: str
    status_code: Optional[int] = None
    ip_address: Optional[str] = None
    body: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class PatientInfo(BaseModel):
    """Schema returned when extracting patient information from a document."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    used_ocr: Optional[bool] = None


class DeletedOrder(BaseModel):
    """Schema returned for a deleted order entry."""

    id: int
    original_order_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    description: Optional[str] = None
    deleted_at: datetime

    class Config:
        from_attributes = True