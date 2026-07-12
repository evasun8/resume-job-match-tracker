"""backend/app/storage/match_store.py

Owned by tasks-database.md (DB-04, rewritten for multi-tenant support in
DB-06). SQLite-backed, user_id-scoped. The nested categories/suggested_bullets
structures have no native SQLite column type, so they're stored as JSON text
and (de)serialized here -- callers still see plain dicts/lists, same as the
old JSON-file version.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from app.storage.db import get_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_result(row) -> dict:
    return {
        "job_id": row["job_id"],
        "generated_at": row["generated_at"],
        "overall_score": row["overall_score"],
        "recommendation": row["recommendation"],
        "recommendation_reasoning": row["recommendation_reasoning"],
        "scoring_method_explanation": row["scoring_method_explanation"],
        "categories": json.loads(row["categories_json"]),
        "suggested_bullets": json.loads(row["suggested_bullets_json"]),
    }


def get_match_result(user_id: int, job_id: str) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM match_results WHERE job_id = ? AND user_id = ?",
            (job_id, user_id),
        ).fetchone()
        return _row_to_result(row) if row else None
    finally:
        conn.close()


def save_match_result(user_id: int, job_id: str, match_data: dict) -> dict:
    conn = get_connection()
    try:
        now = _now()
        conn.execute(
            """
            INSERT INTO match_results (
                job_id, user_id, generated_at, overall_score, recommendation,
                recommendation_reasoning, scoring_method_explanation,
                categories_json, suggested_bullets_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(job_id) DO UPDATE SET
                generated_at = excluded.generated_at,
                overall_score = excluded.overall_score,
                recommendation = excluded.recommendation,
                recommendation_reasoning = excluded.recommendation_reasoning,
                scoring_method_explanation = excluded.scoring_method_explanation,
                categories_json = excluded.categories_json,
                suggested_bullets_json = excluded.suggested_bullets_json
            """,
            (
                job_id,
                user_id,
                now,
                match_data["overall_score"],
                match_data["recommendation"],
                match_data["recommendation_reasoning"],
                match_data["scoring_method_explanation"],
                json.dumps(match_data["categories"]),
                json.dumps(match_data["suggested_bullets"]),
            ),
        )
        conn.commit()
    finally:
        conn.close()

    return get_match_result(user_id, job_id)


def get_match_summaries(user_id: int) -> dict:
    conn = get_connection()
    try:
        rows = conn.execute(
            "SELECT job_id, overall_score, recommendation FROM match_results WHERE user_id = ?",
            (user_id,),
        ).fetchall()
        return {
            row["job_id"]: {
                "overall_score": row["overall_score"],
                "recommendation": row["recommendation"],
            }
            for row in rows
        }
    finally:
        conn.close()
