"""Core financial pipeline: load -> validate -> detect anomalies -> report.

Designed to be reusable outside the API (see cli.py) and dependency-light.
"""
from __future__ import annotations

import io

import numpy as np
import pandas as pd

REQUIRED_COLUMNS = ["date", "amount"]
OPTIONAL_COLUMNS = ["category", "merchant", "description", "transaction_id"]

ANOMALY_METHODS = ("zscore", "iqr", "isolation_forest")


class PipelineError(ValueError):
    """Raised for user-fixable input problems (bad file, missing columns)."""


# --------------------------------------------------------------------------- #
# Loading & validation
# --------------------------------------------------------------------------- #
def load_transactions(file_bytes: bytes, filename: str) -> pd.DataFrame:
    """Read a CSV or Excel file into a validated, cleaned DataFrame."""
    name = (filename or "").lower()
    try:
        if name.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(file_bytes))
        elif name.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(file_bytes))
        else:
            raise PipelineError("Unsupported file type. Upload a .csv or .xlsx file.")
    except PipelineError:
        raise
    except Exception as e:  # pragma: no cover - defensive parse guard
        raise PipelineError(f"Could not parse file: {e}") from e

    return validate_and_clean(df)


def validate_and_clean(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names, enforce required columns, coerce types."""
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise PipelineError(
            f"Missing required column(s): {missing}. "
            f"File must contain at least: {REQUIRED_COLUMNS}."
        )

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

    before = len(df)
    df = df.dropna(subset=["date", "amount"]).reset_index(drop=True)
    df.attrs["dropped_rows"] = before - len(df)

    if df.empty:
        raise PipelineError("No valid rows after parsing 'date' and 'amount'.")
    return df


# --------------------------------------------------------------------------- #
# Anomaly detection
# --------------------------------------------------------------------------- #
def detect_anomalies(df: pd.DataFrame, method: str = "zscore",
                     threshold: float = 3.0,
                     feature_columns: list[str] | None = None) -> pd.DataFrame:
    """Flag anomalous transactions. Returns df + is_anomaly/anomaly_score.

    `zscore` and `iqr` are univariate on `amount`. `isolation_forest` is
    multivariate: pass `feature_columns` to score on several numeric columns
    (e.g. all features of a fraud dataset), defaulting to `["amount"]`.
    """
    if method not in ANOMALY_METHODS:
        raise PipelineError(f"Unknown method '{method}'. Choose from {ANOMALY_METHODS}.")

    df = df.copy()
    values = df["amount"].to_numpy(dtype=float)

    if method == "zscore":
        mean, std = values.mean(), values.std()
        scores = np.abs((values - mean) / std) if std > 0 else np.zeros_like(values)
        df["anomaly_score"] = np.round(scores, 4)
        df["is_anomaly"] = scores > threshold

    elif method == "iqr":
        q1, q3 = np.percentile(values, [25, 75])
        iqr = q3 - q1
        low, high = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        # score = how many IQRs outside the fence (0 if inside)
        below = np.clip((low - values) / iqr, 0, None) if iqr > 0 else np.zeros_like(values)
        above = np.clip((values - high) / iqr, 0, None) if iqr > 0 else np.zeros_like(values)
        df["anomaly_score"] = np.round(np.maximum(below, above), 4)
        df["is_anomaly"] = (values < low) | (values > high)

    else:  # isolation_forest (multivariate)
        from sklearn.ensemble import IsolationForest
        cols = feature_columns or ["amount"]
        X = df[cols].to_numpy(dtype=float)
        clf = IsolationForest(contamination="auto", random_state=42, n_jobs=-1)
        preds = clf.fit_predict(X)               # -1 = outlier
        raw = -clf.score_samples(X)              # higher = more anomalous
        df["anomaly_score"] = np.round(raw, 4)
        df["is_anomaly"] = preds == -1

    return df


# --------------------------------------------------------------------------- #
# Reporting
# --------------------------------------------------------------------------- #
def generate_report(df: pd.DataFrame, method: str = "zscore",
                    threshold: float = 3.0) -> dict:
    """Full financial report: summary, cash flow, breakdowns, and anomalies."""
    flagged = detect_anomalies(df, method=method, threshold=threshold)
    amounts = df["amount"]

    income = float(amounts[amounts > 0].sum())
    expense = float(amounts[amounts < 0].sum())

    report = {
        "summary": {
            "total_transactions": int(len(df)),
            "total_amount": round(float(amounts.sum()), 2),
            "avg_transaction": round(float(amounts.mean()), 2),
            "median_transaction": round(float(amounts.median()), 2),
            "min_transaction": round(float(amounts.min()), 2),
            "max_transaction": round(float(amounts.max()), 2),
            "date_range": {
                "start": str(df["date"].min().date()),
                "end": str(df["date"].max().date()),
            },
            "dropped_invalid_rows": int(df.attrs.get("dropped_rows", 0)),
        },
        "cash_flow": {
            "total_income": round(income, 2),
            "total_expense": round(expense, 2),
            "net": round(income + expense, 2),
        },
        "monthly_breakdown": _monthly_breakdown(df),
        "anomalies": {
            "method": method,
            "count": int(flagged["is_anomaly"].sum()),
            "transactions": _anomaly_records(flagged),
        },
    }
    if "category" in df.columns:
        report["category_breakdown"] = _group_breakdown(df, "category")
    if "merchant" in df.columns:
        report["top_merchants"] = _group_breakdown(df, "merchant", top=10)
    return report


def _monthly_breakdown(df: pd.DataFrame) -> list[dict]:
    g = df.groupby(df["date"].dt.to_period("M"))["amount"]
    out = []
    for period, series in g:
        out.append({
            "month": str(period),
            "total": round(float(series.sum()), 2),
            "income": round(float(series[series > 0].sum()), 2),
            "expense": round(float(series[series < 0].sum()), 2),
            "count": int(series.size),
        })
    return out


def _group_breakdown(df: pd.DataFrame, col: str, top: int | None = None) -> list[dict]:
    g = (df.groupby(col)["amount"]
         .agg(total="sum", count="size")
         .sort_values("total"))
    if top:
        g = g.reindex(g["total"].abs().sort_values(ascending=False).index).head(top)
    return [
        {col: str(idx), "total": round(float(r["total"]), 2), "count": int(r["count"])}
        for idx, r in g.iterrows()
    ]


def _anomaly_records(flagged: pd.DataFrame) -> list[dict]:
    cols = [c for c in ["transaction_id", "date", "amount", "category",
                        "merchant", "anomaly_score"] if c in flagged.columns]
    rows = flagged[flagged["is_anomaly"]].sort_values("anomaly_score", ascending=False)[cols]
    records = []
    for _, r in rows.iterrows():
        rec = r.to_dict()
        if "date" in rec:
            rec["date"] = str(pd.Timestamp(rec["date"]).date())
        rec["amount"] = round(float(rec["amount"]), 2)
        records.append(rec)
    return records
