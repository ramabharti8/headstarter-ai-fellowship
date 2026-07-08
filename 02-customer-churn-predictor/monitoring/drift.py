"""Data-drift monitoring for the churn model.

Compares the *reference* distribution (the training data) against the *current*
distribution (the customer features actually sent to the API, pulled from the
prediction log) and flags features whose distribution has shifted.

Two complementary signals per feature:
  - **PSI** (Population Stability Index): the industry-standard drift metric.
      PSI < 0.1  = stable ·  0.1–0.2 = moderate shift ·  > 0.2 = significant drift.
  - **KS test** p-value: probability the two samples share a distribution.

Evidently would do this too, but a hand-rolled PSI/KS monitor is dependency-light,
fully transparent, and easy to explain. Run:

    python monitoring/drift.py --reference data/telco_churn.csv \
        --current-db models/predictions.db --out models/drift_report.html
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.model import FEATURES

PSI_MODERATE = 0.1
PSI_SIGNIFICANT = 0.2


def psi(reference: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index between two samples, binned on reference quantiles."""
    reference = np.asarray(reference, dtype=float)
    current = np.asarray(current, dtype=float)
    edges = np.unique(np.quantile(reference, np.linspace(0, 1, bins + 1)))
    if len(edges) < 3:  # (near-)constant feature -> no meaningful drift
        return 0.0
    edges[0], edges[-1] = -np.inf, np.inf
    eps = 1e-6
    ref_pct = np.clip(np.histogram(reference, edges)[0] / len(reference), eps, None)
    cur_pct = np.clip(np.histogram(current, edges)[0] / len(current), eps, None)
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def _level(value: float) -> str:
    if value > PSI_SIGNIFICANT:
        return "significant"
    if value > PSI_MODERATE:
        return "moderate"
    return "stable"


def compute_drift(reference: pd.DataFrame, current: pd.DataFrame) -> dict:
    """Per-feature PSI + KS p-value and an overall drift summary."""
    per_feature = {}
    for col in FEATURES:
        if col not in reference or col not in current:
            continue
        value = psi(reference[col].values, current[col].values)
        try:
            ks_p = float(stats.ks_2samp(reference[col].values, current[col].values).pvalue)
        except Exception:
            ks_p = None
        per_feature[col] = {
            "psi": round(value, 4),
            "ks_pvalue": round(ks_p, 4) if ks_p is not None else None,
            "level": _level(value),
        }

    drifted = [c for c, m in per_feature.items() if m["level"] == "significant"]
    n = len(per_feature)
    return {
        "n_features": n,
        "n_drifted": len(drifted),
        "share_drifted": round(len(drifted) / n, 3) if n else 0.0,
        "drifted_features": drifted,
        "reference_rows": int(len(reference)),
        "current_rows": int(len(current)),
        "per_feature": per_feature,
    }


def render_html(summary: dict) -> str:
    rows = "".join(
        f"<tr class='{m['level']}'><td>{c}</td><td>{m['psi']}</td>"
        f"<td>{m['ks_pvalue']}</td><td>{m['level']}</td></tr>"
        for c, m in summary["per_feature"].items()
    )
    banner = ("#e5484d" if summary["n_drifted"] else "#30a46c")
    return f"""<!doctype html><html><head><meta charset='utf-8'>
<title>Churn Drift Report</title><style>
body{{font-family:system-ui,sans-serif;margin:2rem;color:#1a1a1a}}
h1{{margin-bottom:.2rem}} table{{border-collapse:collapse;margin-top:1rem;width:100%}}
th,td{{border:1px solid #ddd;padding:.5rem .7rem;text-align:left}}
th{{background:#f4f4f5}} .significant{{background:#fdecec}} .moderate{{background:#fff7e6}}
.badge{{display:inline-block;padding:.3rem .7rem;border-radius:6px;color:#fff;background:{banner}}}
</style></head><body>
<h1>Customer Churn — Data Drift Report</h1>
<p class='badge'>{summary['n_drifted']} of {summary['n_features']} features drifted
({summary['share_drifted']:.0%})</p>
<p>Reference rows: {summary['reference_rows']:,} &middot;
Current rows: {summary['current_rows']:,}</p>
<table><tr><th>Feature</th><th>PSI</th><th>KS p-value</th><th>Level</th></tr>
{rows}</table>
<p style='color:#666;margin-top:1rem'>PSI &lt; 0.1 stable · 0.1–0.2 moderate · &gt; 0.2 significant drift.</p>
</body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute data drift vs. training data")
    parser.add_argument("--reference", default="data/telco_churn.csv")
    parser.add_argument("--current-db", default="models/predictions.db")
    parser.add_argument("--current-csv", default=None,
                        help="Use a CSV as the current window instead of the prediction DB")
    parser.add_argument("--out", default="models/drift_report.html")
    parser.add_argument("--json-out", default="models/drift_summary.json")
    args = parser.parse_args()

    reference = pd.read_csv(args.reference)

    if args.current_csv:
        current = pd.read_csv(args.current_csv)
    else:
        os.environ["PREDICTIONS_DB"] = args.current_db
        from app import store
        store.DB_PATH = args.current_db
        current = store.features_df()

    if current.empty:
        print("No current data to compare — serve some predictions first "
              "(the prediction log is empty).")
        return

    summary = compute_drift(reference, current)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(render_html(summary))
    with open(args.json_out, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"Drift: {summary['n_drifted']}/{summary['n_features']} features drifted "
          f"({summary['share_drifted']:.0%}).  "
          f"Drifted: {summary['drifted_features'] or 'none'}")
    print(f"Report -> {args.out}  |  Summary -> {args.json_out}")


if __name__ == "__main__":
    main()
