"""
SQLAlchemy models used by the application.

This module defines the ORM models representing the tables in our database:

- **Order**: Represents an order placed by a user or extracted from an uploaded
  document. It stores basic identifying information about a patient and
  optional metadata such as a description and timestamps.
- **ActivityLog**: Captures information about every HTTP request processed
  by the application for auditing and debugging purposes. It records the
  method, path, status code, client IP, request body and timestamp.
"""

from sqlalchemy import Column, Integer, String, DateTime, Text, func
from datetime import datetime, timezone

from database import Base


class Order(Base):
    """Represents a patient order or record.

    For this assessment we keep the order model intentionally simple. It
    includes the patient's first name, last name, date of birth and an
    optional description. Timestamps are automatically generated using
    database functions.
    """

    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    date_of_birth = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(timezone.utc))


class ActivityLog(Base):
    """Stores a record of each HTTP request received by the API.

    Logging incoming requests allows us to audit usage patterns, debug issues
    and provide a record of actions taken by users. Only basic data is
    captured to avoid storing sensitive information.
    """

    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    status_code = Column(Integer, nullable=True)
    ip_address = Column(String, nullable=True)
    body = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DeletedOrder(Base):
    """
    Soft history of deleted orders for the UI.

    We snapshot the key fields before deleting the live Order row so we can
    display "Recently deleted orders" without complicating the main schema.
    """

    __tablename__ = "deleted_orders"

    id = Column(Integer, primary_key=True, index=True)
    original_order_id = Column(Integer, nullable=False)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    date_of_birth = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    deleted_at = Column(DateTime(timezone=True), server_default=func.now())