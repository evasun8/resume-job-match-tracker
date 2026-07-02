"""FastAPI application entrypoint (BE-01, error handling per BE-09)."""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Importing app.config eagerly forces a clear startup error if OPENAI_API_KEY
# is unset, rather than a silent failure on first LLM call.
from app import config  # noqa: F401
from app.routers import jobs, resume
from app.services.llm_match import MatchAnalysisError
from app.storage.bootstrap import ensure_data_files

logger = logging.getLogger(__name__)

app = FastAPI(title="Resume-JD Match Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router)
app.include_router(jobs.router)


@app.on_event("startup")
async def on_startup():
    ensure_data_files()


@app.exception_handler(MatchAnalysisError)
async def match_analysis_error_handler(request: Request, exc: MatchAnalysisError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Never leak stack traces or internal exception details to the client.
    logger.exception("Unhandled exception while processing request")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health():
    return {"status": "ok"}
