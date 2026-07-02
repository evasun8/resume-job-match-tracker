"""Text extraction for uploaded resume/JD files.

Supports .txt (Phase A), .pdf (via pdfplumber) and .docx (via python-docx)
per BE-08. Raises TextExtractionError on any failure (corrupt/empty/
unsupported file) so routers can turn it into a clean 400 response.
"""
import io

SUPPORTED_EXTENSIONS = {".txt", ".pdf", ".docx"}


class TextExtractionError(Exception):
    """Raised when text cannot be extracted from an uploaded file."""


def _extract_txt(content: bytes) -> str:
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception as exc:
            raise TextExtractionError("Could not decode text file.") from exc
    return text


def _extract_pdf(content: bytes) -> str:
    try:
        import pdfplumber
    except ImportError as exc:  # pragma: no cover
        raise TextExtractionError("PDF extraction is not available on this server.") from exc

    try:
        text_parts = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                text_parts.append(page_text)
        text = "\n".join(text_parts)
    except Exception as exc:
        raise TextExtractionError("Could not read PDF file; it may be corrupted or unsupported.") from exc

    if not text.strip():
        raise TextExtractionError("No extractable text found in PDF (it may be a scanned/image-only PDF).")
    return text


def _extract_docx(content: bytes) -> str:
    try:
        import docx
    except ImportError as exc:  # pragma: no cover
        raise TextExtractionError("DOCX extraction is not available on this server.") from exc

    try:
        document = docx.Document(io.BytesIO(content))
        text = "\n".join(p.text for p in document.paragraphs)
    except Exception as exc:
        raise TextExtractionError("Could not read DOCX file; it may be corrupted or unsupported.") from exc

    if not text.strip():
        raise TextExtractionError("No extractable text found in DOCX file.")
    return text


def extract_text(filename: str, content: bytes) -> str:
    """Extract text from an uploaded file's raw bytes based on its extension.

    Raises TextExtractionError for unsupported extensions, empty content, or
    extraction failures.
    """
    if not content:
        raise TextExtractionError("Uploaded file is empty.")

    lower_name = (filename or "").lower()
    if lower_name.endswith(".txt"):
        text = _extract_txt(content)
    elif lower_name.endswith(".pdf"):
        text = _extract_pdf(content)
    elif lower_name.endswith(".docx"):
        text = _extract_docx(content)
    else:
        raise TextExtractionError(
            "Unsupported file type. Supported formats: .txt, .pdf, .docx"
        )

    if not text.strip():
        raise TextExtractionError("Uploaded file contained no readable text.")

    return text
