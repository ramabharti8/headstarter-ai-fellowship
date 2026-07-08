"""Structured (JSON) logging via structlog.

Emits one JSON line per event with a timestamp and level, so logs are ready for
ingestion by a log aggregator (CloudWatch, Loki, Datadog, ...) in production.
"""
from __future__ import annotations

import logging

import structlog


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", level=getattr(logging, level.upper(), logging.INFO))
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, level.upper(), logging.INFO)
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = "churn"):
    return structlog.get_logger(name)
