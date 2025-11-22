# GenHealth Order and Document Processing System

This repository contains a full-stack application built with FastAPI and React. It allows users to upload documents, extract patient information, and manage patient orders through a clean web interface. The project was designed to satisfy the requirements of the GenHealth full-stack assessment, with additional functionality and structure to reflect a more production-oriented implementation.

## Overview

The system includes:

* A FastAPI backend with CRUD operations for orders, soft deletion, activity logging, and a document extraction pipeline.
* A React frontend with separate tabs for Orders, Activity Logs, and Deleted Orders.
* Support for PDF, DOCX, and text document uploads.
* OCR fallback using Tesseract for scanned or image-based PDFs.
* Automatic population of order fields based on extracted information.
* A Docker-based deployment, with a production deployment ready for Railway.

## Features

### Order Management

* Create, view, delete, and restore orders.
* Automatically extract patient information from documents to populate order forms.
* Dedicated "Deleted Orders" tab that shows soft-deleted items.
* Real-time updates across all tabs with auto-refresh functionality.

### Document Upload and Extraction

* Accepts PDF (text-based or scanned), DOCX, and plain text files.
* Extracts first name, last name, date of birth, and when available, address and phone number.
* Uses regular expression patterns for structured extraction.
* Falls back to OCR when the document does not contain extractable text.
* The frontend indicates whether OCR was used through a simple badge.
* Smart date formatting that handles various input formats (YYYY-MM-DD, MM/DD/YYYY, etc.).

### Activity Logging

A logging middleware records every API request to a SQLite table. Each log entry includes:

* HTTP method
* Path
* Response status code
* Timestamp (with proper timezone handling)
* Client IP
* Request body with meaningful descriptions

The React interface includes an Activity Logs tab with the ability to expand individual entries to see more details. Logs auto-refresh when switching tabs and after performing actions.

### Frontend

* Built with React and Vite.
* Three-tab interface for Orders, Activity Logs, and Deleted Orders.
* Upload section that supports extraction and auto-filling of form fields.
* Responsive layout with clean button and modal interactions.
* Toast notifications for comprehensive user feedback.
* Auto-refresh functionality for seamless data updates.
* Proper timezone display and date formatting.

### Deployment

* The project uses a multi-stage Dockerfile that builds the frontend and runs the FastAPI backend.
* Tesseract OCR and the necessary system packages are installed in the container.
* Railway-compatible configuration with dynamic port handling.
* The application is ready for deployment on Railway with HTTPS domain support.

## Project Structure

```
genhealth/
├── client/                # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx        # Main application component
│   │   ├── App.css        # Styling
│   │   └── main.jsx       # Entry point
│   ├── package.json
│   └── dist/              # Compiled production build
│
├── app/                   # FastAPI backend
│   ├── main.py           # FastAPI application with middleware
│   ├── schemas.py        # Pydantic models
│   ├── models.py         # SQLAlchemy ORM models
│   ├── database.py       # Database configuration
│   └── static/           # Served frontend assets (in production)
│
├── requirements.txt       # Python dependencies
├── Dockerfile            # Multi-stage Docker build
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## Running Locally

### Backend (FastAPI)

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the server:

```bash
cd app
uvicorn main:app --reload
```

API documentation will be available at:

* [http://localhost:8000/docs](http://localhost:8000/docs)
* [http://localhost:8000/redoc](http://localhost:8000/redoc)

### Frontend (React)

```bash
cd client
npm install
npm run dev
```

To build production assets:

```bash
npm run build
```

The compiled files will be placed in `client/dist/`, which are served by FastAPI in production.

## Running with Docker

Build the image:

```bash
docker build -t genhealth-app .
```

Run the container:

```bash
docker run -p 8000:8000 genhealth-app
```

Access the application at [http://localhost:8000/](http://localhost:8000/).

## API Summary

| Method | Path                  | Description                                       |
| ------ | --------------------- | ------------------------------------------------- |
| POST   | /orders               | Create an order                                   |
| GET    | /orders               | List orders                                       |
| GET    | /orders/{id}          | Retrieve a single order                           |
| DELETE | /orders/{id}          | Soft delete an order                              |
| GET    | /deleted-orders       | List deleted orders                               |
| POST   | /extract/patient-info | Upload a document and extract patient information |
| GET    | /activity-logs        | Retrieve activity logs                            |

## Key Technical Features

### Smart Middleware
- Activity logging with path exclusions to prevent noise
- Meaningful request descriptions based on endpoint context
- Proper handling of multipart form data and JSON requests

### OCR Integration
- Seamless fallback from direct text extraction to OCR
- Support for various document formats (PDF, DOCX, TXT)
- Clear indication in UI when OCR processing was used

### Data Management
- SQLite database with proper relationship modeling
- Soft deletion pattern for order management
- Timezone-aware timestamp handling
- Auto-refresh functionality across all data views

### Production Readiness
- Multi-stage Docker build for optimized images
- Railway deployment compatibility with dynamic port binding
- Comprehensive error handling and user feedback
- Clean separation of concerns between frontend and backend

## Development Notes

Although this application was built for an assessment, the goal was to construct it as close to a production-ready system as possible within the time constraints. Features such as OCR fallback, detailed logging, Dockerized builds, auto-refresh functionality, and deployment readiness were included to reflect real engineering practices and provide a solid foundation for further development.

The codebase emphasizes:
- Clean, maintainable code structure
- Proper error handling and user experience
- Production deployment considerations
- Real-world functionality beyond basic CRUD operations