from __future__ import annotations

import io

import pytest

from app.extract import ExtractionError, extract_text


def test_plain_text_extraction():
    assert extract_text(b"hello world", "resume.txt") == "hello world"


def test_markdown_extension_treated_as_text():
    text = extract_text(b"# Resume\nSkills: Python", "resume.md")
    assert text == "# Resume\nSkills: Python"


def test_content_type_fallback_for_text():
    assert extract_text(b"plain body", "upload", "text/plain") == "plain body"


def test_empty_file_rejected():
    with pytest.raises(ExtractionError, match="empty"):
        extract_text(b"", "resume.txt")


def test_unsupported_extension_rejected():
    with pytest.raises(ExtractionError, match="Unsupported"):
        extract_text(b"binary junk", "resume.exe")


def test_pdf_extraction_roundtrip():
    pypdf = pytest.importorskip("pypdf")
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    # A blank page has no text layer -> extraction should raise, not crash.
    with pytest.raises(ExtractionError):
        extract_text(buf.getvalue(), "resume.pdf")


def test_docx_extraction():
    docx = pytest.importorskip("docx")
    buf = io.BytesIO()
    document = docx.Document()
    document.add_paragraph("Jordan Lee")
    document.add_paragraph("Python, FastAPI, PostgreSQL")
    document.save(buf)
    text = extract_text(buf.getvalue(), "resume.docx")
    assert "Jordan Lee" in text
    assert "FastAPI" in text


def test_latin1_fallback_decode():
    data = "café résumé".encode("latin-1")
    assert "caf" in extract_text(data, "resume.txt")
