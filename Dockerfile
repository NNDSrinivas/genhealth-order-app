# ---------- Frontend build stage ----------
FROM node:18 AS frontend-build

WORKDIR /frontend

# Install deps
COPY client/package*.json ./
RUN npm install

# Build Vite React app
COPY client/ .
RUN npm run build -- --outDir dist


# ---------- Backend + runtime stage ----------
FROM python:3.11-slim

WORKDIR /app

# System deps for OCR (pdf2image + tesseract)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        tesseract-ocr \
        poppler-utils && \
    rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY app ./app

# Copy built frontend into FastAPI static dir
# (main.py expects to serve static from app/static)
COPY --from=frontend-build /frontend/dist ./app/static

ENV PORT=8000

# FastAPI app is in the app directory, but we need to run it from the right context
WORKDIR /app/app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
