"""Render a report dict into a multi-sheet Excel workbook (in memory)."""
from __future__ import annotations

import io

import pandas as pd


def report_to_excel(report: dict) -> bytes:
    """Serialize a report dict to .xlsx bytes with one sheet per section."""
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        # Summary + cash flow as a flat key/value sheet
        flat = {**_flatten(report["summary"]), **_prefixed(report["cash_flow"], "cash_flow")}
        pd.DataFrame({"metric": list(flat), "value": list(flat.values())}).to_excel(
            writer, sheet_name="Summary", index=False)

        pd.DataFrame(report["monthly_breakdown"]).to_excel(
            writer, sheet_name="Monthly", index=False)

        if report.get("category_breakdown"):
            pd.DataFrame(report["category_breakdown"]).to_excel(
                writer, sheet_name="Categories", index=False)
        if report.get("top_merchants"):
            pd.DataFrame(report["top_merchants"]).to_excel(
                writer, sheet_name="TopMerchants", index=False)

        anomalies = report["anomalies"]["transactions"]
        (pd.DataFrame(anomalies) if anomalies else pd.DataFrame([{"note": "no anomalies"}])).to_excel(
            writer, sheet_name="Anomalies", index=False)

    buffer.seek(0)
    return buffer.getvalue()


def _flatten(d: dict) -> dict:
    out = {}
    for k, v in d.items():
        if isinstance(v, dict):
            out.update({f"{k}_{ik}": iv for ik, iv in v.items()})
        else:
            out[k] = v
    return out


def _prefixed(d: dict, prefix: str) -> dict:
    return {f"{prefix}_{k}": v for k, v in d.items()}
