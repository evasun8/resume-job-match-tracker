"""OpenAI gpt-4o-mini based extraction of {title, company, jd_text} from raw
scraped job-posting page text (BE-10).

Exposes extract_job_fields(page_text, title_hint) -> dict. Raises
JdExtractionError on unrecoverable failure or when no real job description
can be found on the page (e.g. blocked/captcha/non-job page).
"""
import json
import logging
from typing import Optional

from pydantic import BaseModel, ValidationError

from app.config import LLM_MODEL

logger = logging.getLogger(__name__)


class JdExtractionError(Exception):
    """Raised when structured job fields cannot be extracted from the scraped
    page text. Message is safe to surface to callers/clients."""


class _UrlExtraction(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    jd_text: str = ""


_SYSTEM_PROMPT = """You are given raw text scraped from a job posting web \
page. The text may include navigation, footer, ads, or other boilerplate \
noise mixed in with the actual job posting.

Respond with ONLY a single JSON object (no markdown fences, no commentary) \
with EXACTLY this shape:

{
  "title": "<job title, or null if not found>",
  "company": "<hiring company name, or null if not found>",
  "jd_text": "<the core job description body text, cleaned of navigation/footer/ad boilerplate>"
}

If the page does not appear to contain an actual job posting (for example it \
is a login wall, a captcha/blocked page, or unrelated content), set jd_text \
to an empty string "". Do not invent or hallucinate a title, company, or \
description that is not grounded in the provided text."""


def _build_user_prompt(page_text: str, title_hint: str) -> str:
    return (
        f"PAGE TITLE (hint only, may be inaccurate): {title_hint}\n\n"
        "SCRAPED PAGE TEXT:\n"
        f"{page_text}\n\n"
        "Produce the JSON extraction now."
    )


def _get_client(api_key: str):
    from openai import OpenAI

    return OpenAI(api_key=api_key)


def _call_llm(client, page_text: str, title_hint: str, corrective: Optional[str] = None) -> str:
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_prompt(page_text, title_hint)},
    ]
    if corrective:
        messages.append({"role": "user", "content": corrective})

    try:
        response = client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.2,
        )
    except Exception as exc:
        logger.error("LLM request failed: %s", type(exc).__name__)
        raise JdExtractionError("The job extraction service is currently unavailable.") from exc

    try:
        return response.choices[0].message.content
    except (IndexError, AttributeError) as exc:
        raise JdExtractionError("The job extraction service returned an unexpected response.") from exc


def _parse_and_validate(raw_content: str) -> _UrlExtraction:
    try:
        data = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Response was not valid JSON: {exc}") from exc

    try:
        return _UrlExtraction.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Response did not match expected schema: {exc}") from exc


def extract_job_fields(page_text: str, title_hint: str, api_key: str) -> dict:
    """Extract {title, company, jd_text} from scraped job posting page text.

    api_key is the calling user's own OpenAI API key (BE-12).

    Raises JdExtractionError if the LLM call fails, the response is
    malformed after one retry, or no job description could be found on the
    page (empty jd_text).
    """
    client = _get_client(api_key)

    raw_content = _call_llm(client, page_text, title_hint)
    try:
        result = _parse_and_validate(raw_content)
    except ValueError as first_error:
        logger.warning("LLM response failed validation on first attempt: %s", first_error)
        corrective = (
            "Your previous response was invalid or did not match the required "
            "JSON schema exactly. Respond again with ONLY the corrected JSON "
            "object, following the schema precisely, with no extra text."
        )
        raw_content_retry = _call_llm(client, page_text, title_hint, corrective=corrective)
        try:
            result = _parse_and_validate(raw_content_retry)
        except ValueError as second_error:
            logger.error("LLM response failed validation after retry: %s", second_error)
            raise JdExtractionError(
                "Could not extract job details after retrying. Please try again later."
            ) from second_error

    if not result.jd_text.strip():
        raise JdExtractionError(
            "Could not find a job description on that page. It may require login, be "
            "blocked to automated tools, or not be a job posting. Try pasting the "
            "description instead."
        )

    return result.model_dump()
