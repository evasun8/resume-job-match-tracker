"""OpenAI gpt-4o-mini based resume-vs-JD match analysis service (BE-04).

Exposes analyze(resume_text, jd_text) -> dict, matching the match_results.json
per-job shape (minus job_id/generated_at, which the persistence layer stamps
in). Raises MatchAnalysisError on unrecoverable failure. The OpenAI API key
is read only via app.config and is never included in any exception message
or log line.
"""
import json
import logging
from typing import Optional

from pydantic import BaseModel, Field, ValidationError

from app.config import LLM_MODEL, OPENAI_API_KEY

logger = logging.getLogger(__name__)

CATEGORY_NAMES = [
    "hard_skills",
    "tools_platforms",
    "years_experience",
    "certifications",
    "soft_skills",
    "education",
]


class MatchAnalysisError(Exception):
    """Raised when the LLM match analysis cannot be completed reliably.

    The message is safe to surface to callers/clients — it must never embed
    the API key or raw provider exception internals that could leak secrets.
    """


class _Category(BaseModel):
    matched: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)


class _Categories(BaseModel):
    hard_skills: _Category
    tools_platforms: _Category
    years_experience: _Category
    certifications: _Category
    soft_skills: _Category
    education: _Category


class _SuggestedBullet(BaseModel):
    target_gap: str
    suggested_text: str


class _MatchResult(BaseModel):
    overall_score: float = Field(ge=0, le=100)
    recommendation: str
    recommendation_reasoning: str
    scoring_method_explanation: str
    categories: _Categories
    suggested_bullets: list[_SuggestedBullet] = Field(default_factory=list)


_ALLOWED_RECOMMENDATIONS = {"apply", "do_not_apply"}

_SYSTEM_PROMPT = """You are an expert technical recruiter and resume coach. \
You compare a candidate's resume against a job description and produce a \
structured match analysis in JSON.

Respond with ONLY a single JSON object (no markdown fences, no commentary) \
with EXACTLY this shape:

{
  "overall_score": <number 0-100>,
  "recommendation": "apply" | "do_not_apply",
  "recommendation_reasoning": "<free text explaining the recommendation>",
  "scoring_method_explanation": "<free text describing how the score was derived>",
  "categories": {
    "hard_skills": {"matched": [<strings>], "missing": [<strings>]},
    "tools_platforms": {"matched": [<strings>], "missing": [<strings>]},
    "years_experience": {"matched": [<strings>], "missing": [<strings>]},
    "certifications": {"matched": [<strings>], "missing": [<strings>]},
    "soft_skills": {"matched": [<strings>], "missing": [<strings>]},
    "education": {"matched": [<strings>], "missing": [<strings>]}
  },
  "suggested_bullets": [
    {"target_gap": "<which missing item this addresses>", "suggested_text": "<ready-to-paste rewritten resume bullet>"}
  ]
}

All six categories must always be present, even if their matched/missing \
arrays are empty. Be specific and grounded strictly in the resume and job \
description text provided; do not invent qualifications."""


def _build_user_prompt(resume_text: str, jd_text: str) -> str:
    return (
        "RESUME:\n"
        f"{resume_text}\n\n"
        "JOB DESCRIPTION:\n"
        f"{jd_text}\n\n"
        "Produce the JSON match analysis now."
    )


def _get_client():
    from openai import OpenAI

    return OpenAI(api_key=OPENAI_API_KEY)


def _call_llm(client, resume_text: str, jd_text: str, corrective: Optional[str] = None) -> str:
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_prompt(resume_text, jd_text)},
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
        # Never include exc's raw args if they might embed the key; OpenAI
        # SDK exceptions do not include the key in their message, but we
        # still avoid repr()'ing arbitrary provider internals.
        logger.error("LLM request failed: %s", type(exc).__name__)
        raise MatchAnalysisError("The match analysis service is currently unavailable.") from exc

    try:
        return response.choices[0].message.content
    except (IndexError, AttributeError) as exc:
        raise MatchAnalysisError("The match analysis service returned an unexpected response.") from exc


def _parse_and_validate(raw_content: str) -> dict:
    try:
        data = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Response was not valid JSON: {exc}") from exc

    try:
        validated = _MatchResult.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Response did not match expected schema: {exc}") from exc

    if validated.recommendation not in _ALLOWED_RECOMMENDATIONS:
        raise ValueError(
            f"recommendation must be one of {_ALLOWED_RECOMMENDATIONS}, got {validated.recommendation!r}"
        )

    return validated.model_dump()


def analyze(resume_text: str, jd_text: str) -> dict:
    """Run resume-vs-JD match analysis via OpenAI gpt-4o-mini.

    Returns a dict matching the match_results.json per-job shape (minus
    job_id/generated_at). Raises MatchAnalysisError on unrecoverable failure
    (including malformed responses after one retry).
    """
    client = _get_client()

    raw_content = _call_llm(client, resume_text, jd_text)
    try:
        return _parse_and_validate(raw_content)
    except ValueError as first_error:
        logger.warning("LLM response failed validation on first attempt: %s", first_error)

    # One retry with a corrective follow-up prompt.
    corrective = (
        "Your previous response was invalid or did not match the required "
        "JSON schema exactly. Respond again with ONLY the corrected JSON "
        "object, following the schema precisely, with no extra text."
    )
    raw_content_retry = _call_llm(client, resume_text, jd_text, corrective=corrective)
    try:
        return _parse_and_validate(raw_content_retry)
    except ValueError as second_error:
        logger.error("LLM response failed validation after retry: %s", second_error)
        raise MatchAnalysisError(
            "Could not produce a valid match analysis after retrying. Please try again later."
        ) from second_error
