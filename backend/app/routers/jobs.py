"""Job endpoints: POST/GET /api/jobs, GET/PATCH /api/jobs/{id} (BE-03, BE-05, BE-06, BE-07)."""
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import MAX_UPLOAD_SIZE_BYTES
from app.services.llm_match import MatchAnalysisError, analyze
from app.services.text_extraction import TextExtractionError, extract_text
from app.storage import job_store, match_store, resume_store

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class StatusUpdate(BaseModel):
    status: str


@router.post("", status_code=201)
async def create_job(
    jd_file: Optional[UploadFile] = File(default=None),
    jd_text: Optional[str] = Form(default=None),
    title: Optional[str] = Form(default=None),
    company: Optional[str] = Form(default=None),
):
    has_file = jd_file is not None and jd_file.filename
    has_text = jd_text is not None and jd_text.strip() != ""

    if has_file and has_text:
        raise HTTPException(
            status_code=400,
            detail="Provide either jd_file or jd_text, not both/neither.",
        )
    if not has_file and not has_text:
        raise HTTPException(
            status_code=400,
            detail="Provide either jd_file or jd_text, not both/neither.",
        )

    resume = resume_store.get_resume()
    if resume is None:
        raise HTTPException(status_code=409, detail="Upload a resume before adding a job")

    if has_text:
        jd_raw_text = jd_text.strip()
        if not jd_raw_text:
            raise HTTPException(status_code=400, detail="Pasted JD text cannot be empty.")
        jd_original_filename = None
        jd_source_type = "paste"
    else:
        content = await jd_file.read()
        if len(content) > MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="Uploaded file exceeds the 5MB size limit.")
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        try:
            jd_raw_text = extract_text(jd_file.filename, content)
        except TextExtractionError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        jd_original_filename = jd_file.filename
        jd_source_type = "upload"

    job = job_store.create_job(
        title=title,
        company=company,
        jd_raw_text=jd_raw_text,
        jd_original_filename=jd_original_filename,
        jd_source_type=jd_source_type,
    )

    match_result = None
    match_error = None
    try:
        analysis = analyze(resume["raw_text"], jd_raw_text)
        match_result = match_store.save_match_result(job["id"], analysis)
    except MatchAnalysisError as exc:
        match_error = str(exc)

    return {"job": job, "match_result": match_result, "match_error": match_error}


@router.get("")
async def list_jobs():
    jobs = job_store.list_jobs()
    summaries = match_store.get_match_summaries()
    result = []
    for job in jobs:
        result.append(
            {
                **job,
                "match_summary": summaries.get(job["id"]),
            }
        )
    return result


@router.get("/{job_id}")
async def get_job(job_id: str):
    job = job_store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    match_result = match_store.get_match_result(job_id)
    return {"job": job, "match_result": match_result}


@router.patch("/{job_id}")
async def update_job_status(job_id: str, payload: StatusUpdate):
    if payload.status not in job_store.ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status value")

    if job_store.get_job(job_id) is None:
        raise HTTPException(status_code=404, detail="Job not found")

    updated = job_store.update_job_status(job_id, payload.status)
    if updated is None:
        # Should not happen given the checks above, but guard defensively.
        raise HTTPException(status_code=400, detail="Invalid status value")
    return updated
