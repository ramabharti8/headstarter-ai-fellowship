# syntax=docker/dockerfile:1
FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

WORKDIR /app

# faiss-cpu needs the OpenMP runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# --- deps layer (cached until requirements change) ---
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# --- app ---
COPY app ./app

# non-root
RUN useradd --create-home appuser \
 && mkdir -p /app/data && chown -R appuser:appuser /app
USER appuser

ENV QA_DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
