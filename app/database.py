"""
Database setup using SQLAlchemy.

This module configures the SQLAlchemy engine, session and base declarative
class for the application. It also provides a dependency for FastAPI
endpoints to obtain a database session and ensure it is properly closed.
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Using a local SQLite database stored in the project directory. For production
# deployments you might switch this to a PostgreSQL database or another
# relational database supported by SQLAlchemy.
SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"

# `check_same_thread=False` is required only for SQLite. It allows the same
# connection to be accessed from different threads which can occur when
# running asynchronous code in FastAPI.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# `autocommit=False` and `autoflush=False` ensure we have explicit control
# over committing transactions and flushing changes to the database.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for our ORM models. All models should inherit from this.
Base = declarative_base()


def get_db():
    """Provide a database session to path operations via dependency injection.

    Yields a SQLAlchemy session and ensures it is closed after the request
    finishes processing.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()