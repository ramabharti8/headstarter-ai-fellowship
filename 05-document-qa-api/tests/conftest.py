"""Shared fixtures. Everything runs in ``fake_ai`` mode — no network, no API key."""

from __future__ import annotations

import importlib
from pathlib import Path

import pytest
from fpdf import FPDF


@pytest.fixture
def sample_pdf(tmp_path: Path) -> Path:
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.multi_cell(
        0,
        8,
        "OrderFlow quarterly report.\n"
        "The key finding is that revenue grew 42 percent year over year.\n"
        "Churn dropped to 3 percent after the onboarding redesign.",
    )
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.multi_cell(0, 8, "Appendix: the team headcount is 18 people.")
    out = tmp_path / "report.pdf"
    pdf.output(str(out))
    return out


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("QA_FAKE_AI", "1")
    monkeypatch.setenv("QA_DATA_DIR", str(tmp_path / "data"))

    from app import config

    config.get_settings.cache_clear()

    from app import main

    importlib.reload(main)

    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        yield c

    config.get_settings.cache_clear()
