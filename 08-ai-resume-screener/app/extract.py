"""Turn an uploaded resume file into plain text.

Supports PDF (pypdf), Word (python-docx) and plain text — the three formats a
resume realistically shows up in. Both libraries are imported lazily so the
offline test suite (which never uploads a real file, only bytes it already
knows how to parse) doesn't need to import a native extension.
"""

from __future__ import annotations

import io

SUPPORTED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md")


class ExtractionError(ValueError):
    """The upload couldn't be read as text."""


def _ext(filename: str) -> str:
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot >= 0 else ""


def extract_text(data: bytes, filename: str, content_type: str = "") -> str:
    """Dispatch on filename extension (falls back to content-type, then a raw
    UTF-8/latin-1 decode for anything else)."""
    if not data:
        raise ExtractionError("Uploaded file is empty.")

    # The filename extension is authoritative when present — a spoofed or
    # generic content-type (e.g. curl's default) should not smuggle an
    # unsupported file past the check. Content-type only breaks ties when
    # there is no extension at all.
    ext = _ext(filename or "")
    if ext:
        if ext == ".pdf":
            text = _from_pdf(data)
        elif ext == ".docx":
            text = _from_docx(data)
        elif ext in (".txt", ".md"):
            text = _from_text(data)
        else:
            raise ExtractionError(
                f"Unsupported file type '{ext}'. Use PDF, DOCX or plain text."
            )
    elif "pdf" in content_type:
        text = _from_pdf(data)
    elif "wordprocessingml" in content_type:
        text = _from_docx(data)
    else:
        # No extension / no useful content-type — best-effort plain decode.
        text = _from_text(data)

    text = text.strip()
    if not text:
        raise ExtractionError(
            "Could not extract any text from the file (it may be a scanned "
            "image PDF with no text layer)."
        )
    return text


def _from_pdf(data: bytes) -> str:
    try:
        import pypdf
    except ImportError as exc:  # pragma: no cover - exercised only w/o the dep
        raise ExtractionError("PDF support is not installed (pypdf).") from exc
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise ExtractionError(f"Could not read PDF: {exc}") from exc


def _from_docx(data: bytes) -> str:
    try:
        import docx
    except ImportError as exc:  # pragma: no cover
        raise ExtractionError("DOCX support is not installed (python-docx).") from exc
    try:
        document = docx.Document(io.BytesIO(data))
        parts = [p.text for p in document.paragraphs]
        for table in document.tables:
            for row in table.rows:
                parts.extend(cell.text for cell in row.cells)
        return "\n".join(parts)
    except Exception as exc:
        raise ExtractionError(f"Could not read DOCX: {exc}") from exc


def _from_text(data: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ExtractionError("Could not decode file as text.")
