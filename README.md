# Order and Document Processing API

This project implements a minimal yet production‑ready REST API that
provides CRUD operations for an `Order` entity, accepts PDF uploads and
extracts patient information, and logs all user activity. It is written
in Python using [FastAPI](https://fastapi.tiangolo.com/) and uses
[SQLAlchemy](https://www.sqlalchemy.org/) with a local SQLite database for
persistence. The code is organized for clarity and extensibility and is ready
to be containerized and deployed.

## Features

* **Order CRUD** – Create, read, update and delete orders via
  predictable REST endpoints.
* **PDF Upload and Extraction** – Upload a PDF document and
  automatically extract the patient’s first name, last name and date of
  birth using regular expressions. The extracted data is stored as a new
  order for convenience.
* **Activity Logging** – Every HTTP request is logged to the
  `activity_logs` table with the method, path, response status, client IP
  and raw body. This provides an audit trail for debugging and monitoring.
* **SQLite Database** – Uses SQLite for ease of setup. Changing to
  PostgreSQL or another database is straightforward via the
  `SQLALCHEMY_DATABASE_URL` setting in `app/database.py`.
* **Docker‑ready** – Includes a `Dockerfile` to build an image for
  deployment. Simply run `docker build` and `docker run` to start the
  service.

## Getting Started

### Prerequisites

* Python 3.11 or newer
* [Poetry](https://python-poetry.org/) or `pip` for dependency management
* (Optional) Docker for containerization

### Installation

1. Clone this repository (or copy the `server` directory).
2. Install dependencies:

   ```bash
   cd server
   pip install -r requirements.txt
   ```

3. Start the application:

   ```bash
   uvicorn app.main:app --reload
   ```

   The API will be available at `http://127.0.0.1:8000`. Interactive
   documentation is automatically generated at
   `http://127.0.0.1:8000/docs` (Swagger UI) and
   `http://127.0.0.1:8000/redoc`.

### Running with Docker

To build and run the application using Docker:

```bash
cd server
docker build -t order-api .
docker run -p 8000:8000 order-api
```

### API Endpoints

| Method | Path | Description |
| ----- | ---- | ----------- |
| **POST** | `/orders` | Create a new order |
| **GET** | `/orders` | List orders (supports `skip` and `limit` query params) |
| **GET** | `/orders/{id}` | Retrieve a single order by ID |
| **PUT** | `/orders/{id}` | Update an existing order |
| **DELETE** | `/orders/{id}` | Delete an order |
| **POST** | `/extract/patient-info` | Upload a PDF and extract patient info |

The API uses JSON request bodies for the order endpoints and
`multipart/form-data` for the file upload endpoint.

### Example: Extracting Patient Info

To extract patient information from a PDF using `curl`:

```bash
curl -F "file=@/path/to/patient_document.pdf" \
     http://127.0.0.1:8000/extract/patient-info
```

The response will be a JSON object with `first_name`, `last_name` and
`date_of_birth` fields (possibly `null` if not found). The data will
also be inserted into the `orders` table.

### Considerations & Next Steps

This MVP intentionally keeps things simple to meet the assessment
requirements within a short timeframe. For a production deployment you
may want to consider:

* **Authentication and Authorization** to protect endpoints.
* **Input Validation** and more robust error handling.
* **Database Migrations** using Alembic.
* **Async Database Operations** for improved performance.
* **OCR Fallback** using tools like Tesseract for scanned PDFs.
* **Cloud Deployment** to platforms such as AWS, GCP or Azure.

## License

This project is provided as part of a coding assessment and is intended
for demonstration purposes only.