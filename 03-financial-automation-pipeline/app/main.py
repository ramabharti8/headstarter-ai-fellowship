"""FastAPI service for the financial automation pipeline.

Endpoints:
    GET  /                — service metadata
    GET  /health          — health check
    GET  /sample          — download a sample transactions CSV
    POST /analyze         — upload CSV/Excel -> JSON financial report
    POST /analyze/excel   — upload CSV/Excel -> downloadable .xlsx report
"""
import io
import os
import time
import uuid

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.logging_config import configure_logging, get_logger
from app.pipeline import ANOMALY_METHODS, PipelineError, generate_report, load_transactions
from app.report import report_to_excel
from app.security import RATE_LIMIT, auth_enabled, limiter, require_api_key

configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
log = get_logger("finance.api")

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))  # 10 MB

app = FastAPI(
    title="Financial Automation Pipeline",
    description="Upload transaction files to get automated reports and anomaly detection.",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(PipelineError)
async def _pipeline_error_handler(request: Request, exc: PipelineError):
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    log.info("request", request_id=request_id, method=request.method,
             path=request.url.path, status=response.status_code,
             latency_ms=round((time.perf_counter() - start) * 1000, 2))
    return response


async def _read_upload(file: UploadFile) -> bytes:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413,
                            detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)")
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    return data


@app.get("/")
def root():
    return {
        "service": "Financial Automation Pipeline",
        "version": "1.0.0",
        "docs": "/docs",
        "auth_required": auth_enabled(),
        "rate_limit": RATE_LIMIT,
        "anomaly_methods": list(ANOMALY_METHODS),
        "endpoints": ["/analyze", "/analyze/excel", "/sample", "/health"],
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/sample")
def sample(rows: int = Query(300, ge=10, le=5000)):
    """Download a synthetic sample CSV to try the pipeline."""
    from data.generate_data import generate
    df = generate(rows)
    csv = df.to_csv(index=False).encode()
    return StreamingResponse(
        io.BytesIO(csv), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_transactions.csv"},
    )


@app.post("/analyze", dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT)
async def analyze(
    request: Request,
    file: UploadFile = File(...),
    method: str = Query("zscore", enum=list(ANOMALY_METHODS)),
    threshold: float = Query(3.0, gt=0),
):
    data = await _read_upload(file)
    df = load_transactions(data, file.filename)
    return generate_report(df, method=method, threshold=threshold)


@app.post("/analyze/excel", dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT)
async def analyze_excel(
    request: Request,
    file: UploadFile = File(...),
    method: str = Query("zscore", enum=list(ANOMALY_METHODS)),
    threshold: float = Query(3.0, gt=0),
):
    data = await _read_upload(file)
    df = load_transactions(data, file.filename)
    report = generate_report(df, method=method, threshold=threshold)
    xlsx = report_to_excel(report)
    return StreamingResponse(
        io.BytesIO(xlsx),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=financial_report.xlsx"},
    )
