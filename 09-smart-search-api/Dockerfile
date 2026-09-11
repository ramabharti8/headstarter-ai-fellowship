# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    FASTEMBED_CACHE_PATH=/app/.cache/fastembed

WORKDIR /app

# --- deps layer (cached until requirements change) ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- app ---
COPY app ./app
COPY scripts ./scripts

# Bake the default (zero-API-key) embedding model into the image.
RUN python scripts/download_model.py

# Persistent index data lives on a volume — see docker-compose.yml.
RUN mkdir -p /app/data

# non-root
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
