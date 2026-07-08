"""SQLite prediction store.

Every prediction served by the API is logged here (inputs + output + timestamp)
so predictions can be audited, replayed, and monitored for drift later. A single
file DB keeps the project dependency-light; swap the connection for Postgres in a
real deployment.
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone

DB_PATH = os.environ.get("PREDICTIONS_DB", "models/predictions.db")


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    # check_same_thread=False: FastAPI serves sync endpoints across a threadpool.
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                features TEXT NOT NULL,
                churn_probability REAL NOT NULL,
                will_churn INTEGER NOT NULL,
                risk_level TEXT NOT NULL
            )
            """
        )


def log_prediction(features: dict, result: dict) -> None:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO predictions (ts, features, churn_probability, will_churn, risk_level) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                datetime.now(timezone.utc).isoformat(),
                json.dumps(features),
                result["churn_probability"],
                int(result["will_churn"]),
                result["risk_level"],
            ),
        )


def recent(limit: int = 20) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT ts, churn_probability, will_churn, risk_level "
            "FROM predictions ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def features_df(limit: int = 5000):
    """Return logged prediction *inputs* as a DataFrame (for drift analysis)."""
    import pandas as pd

    with _connect() as conn:
        rows = conn.execute(
            "SELECT features FROM predictions ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    if not rows:
        return pd.DataFrame()
    return pd.DataFrame([json.loads(r["features"]) for r in rows])


def stats() -> dict:
    with _connect() as conn:
        total = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
        if not total:
            return {"total": 0, "avg_probability": None, "risk_counts": {}}
        avg = conn.execute("SELECT AVG(churn_probability) FROM predictions").fetchone()[0]
        rows = conn.execute(
            "SELECT risk_level, COUNT(*) c FROM predictions GROUP BY risk_level"
        ).fetchall()
    return {
        "total": total,
        "avg_probability": round(float(avg), 4),
        "risk_counts": {r["risk_level"]: r["c"] for r in rows},
    }
