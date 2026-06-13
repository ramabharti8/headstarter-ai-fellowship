import pandas as pd
import numpy as np
from scipy import stats
from typing import Any


def load_transactions(file_bytes: bytes, filename: str) -> pd.DataFrame:
    import io
    if filename.endswith(".csv"):
        return pd.read_csv(io.BytesIO(file_bytes), parse_dates=["date"])
    return pd.read_excel(io.BytesIO(file_bytes), parse_dates=["date"])


def detect_anomalies(df: pd.DataFrame, column: str = "amount", threshold: float = 3.0) -> pd.DataFrame:
    z_scores = np.abs(stats.zscore(df[column].dropna()))
    df = df.copy()
    df["z_score"] = np.nan
    df.loc[df[column].notna(), "z_score"] = z_scores
    df["is_anomaly"] = df["z_score"] > threshold
    return df


def generate_report(df: pd.DataFrame) -> dict[str, Any]:
    anomalies = detect_anomalies(df)
    monthly = df.groupby(df["date"].dt.to_period("M"))["amount"].agg(["sum", "mean", "count"])

    return {
        "summary": {
            "total_transactions": len(df),
            "total_amount": float(df["amount"].sum()),
            "avg_transaction": float(df["amount"].mean()),
            "date_range": {
                "start": str(df["date"].min().date()),
                "end": str(df["date"].max().date()),
            },
        },
        "anomalies": {
            "count": int(anomalies["is_anomaly"].sum()),
            "transactions": anomalies[anomalies["is_anomaly"]][["date", "amount", "z_score"]]
            .to_dict(orient="records"),
        },
        "monthly_breakdown": monthly.reset_index().rename(columns={"sum": "total", "mean": "average"})
        .to_dict(orient="records"),
    }
