"""Resume endpoints: POST /api/resume, GET /api/resume (BE-02, extended by BE-08)."""
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.config import MAX_UPLOAD_SIZE_BYTES
from app.services.text_extraction import TextExtractionError, extract_text
from app.storage import resume_store

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.post("")
async def upload_resume(
    file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
):
    has_file = file is not None and file.filename
    has_text = text is not None and text.strip() != ""

    if has_file and has_text:
        raise HTTPException(
            status_code=400,
            detail="Provide either a file or pasted text, not both/neither.",
        )
    if not has_file and not has_text:
        raise HTTPException(
            status_code=400,
            detail="Provide either a file or pasted text, not both/neither.",
        )

    if has_text:
        raw_text = text.strip()
        if not raw_text:
            raise HTTPException(status_code=400, detail="Pasted text cannot be empty.")
        resume = resume_store.save_resume(
            raw_text=raw_text, original_filename=None, source_type="paste"
        )
        return resume

    # File upload path.
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded file exceeds the 5MB size limit.")
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        raw_text = extract_text(file.filename, content)
    except TextExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    resume = resume_store.save_resume(
        raw_text=raw_text, original_filename=file.filename, source_type="upload"
    )
    return resume


@router.get("")
async def get_resume():
    resume = resume_store.get_resume()
    if resume is None:
        raise HTTPException(status_code=404, detail="No resume uploaded yet")
    return resume
