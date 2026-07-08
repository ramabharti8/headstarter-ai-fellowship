"""Load the real IBM Telco Customer Churn dataset and map it to our schema.

The public Telco CSV (columns like `Contract`, `PaymentMethod`, `InternetService`,
`Churn` = Yes/No) is normalized into the 10 numeric FEATURES + `churn` that
`app/model.py` expects, so the same training/serving code works on real data.

Download the raw CSV once (7,043 rows):
    curl -sL https://raw.githubusercontent.com/IBM/telco-customer-churn-on-icp4d/master/data/Telco-Customer-Churn.csv -o data/_raw_telco.csv

Then normalize it:
    python data/load_telco.py --raw data/_raw_telco.csv --out data/telco_churn.csv
"""
from __future__ import annotations

import argparse
import os
import sys

import pandas as pd

# Allow running as `python data/load_telco.py` (adds project root to path).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.model import FEATURES, TARGET

CONTRACT_MAP = {"Month-to-month": 0, "One year": 1, "Two year": 2}
PAYMENT_MAP = {
    "Electronic check": 0,
    "Mailed check": 1,
    "Bank transfer (automatic)": 2,
    "Credit card (automatic)": 3,
}
# Add-on services counted toward num_products (value "Yes" only)
ADDONS = [
    "MultipleLines", "OnlineSecurity", "OnlineBackup", "DeviceProtection",
    "TechSupport", "StreamingTV", "StreamingMovies",
]


def load_and_map(raw_path: str) -> pd.DataFrame:
    """Read the raw Telco CSV and return a dataframe with FEATURES + churn."""
    raw = pd.read_csv(raw_path)

    out = pd.DataFrame()
    out["tenure"] = raw["tenure"].astype(int)
    out["monthly_charges"] = raw["MonthlyCharges"].astype(float)
    # 11 rows (tenure 0) have blank TotalCharges -> coerce, then fill with 0.
    out["total_charges"] = pd.to_numeric(raw["TotalCharges"], errors="coerce").fillna(0.0)

    has_internet = (raw["InternetService"] != "No").astype(int)
    has_phone = (raw["PhoneService"] == "Yes").astype(int)
    addon_count = sum((raw[c] == "Yes").astype(int) for c in ADDONS)
    out["num_products"] = (has_internet + has_phone + addon_count).clip(lower=1).astype(int)

    out["has_internet"] = has_internet
    out["has_phone"] = has_phone
    out["contract_type"] = raw["Contract"].map(CONTRACT_MAP).astype(int)
    out["payment_method"] = raw["PaymentMethod"].map(PAYMENT_MAP).astype(int)
    out["paperless_billing"] = (raw["PaperlessBilling"] == "Yes").astype(int)
    out["senior_citizen"] = raw["SeniorCitizen"].astype(int)
    out[TARGET] = (raw["Churn"] == "Yes").astype(int)

    # Guard against unmapped categorical values (would show up as NaN -> error).
    if out[FEATURES].isnull().any().any():
        bad = out[FEATURES].columns[out[FEATURES].isnull().any()].tolist()
        raise ValueError(f"Unmapped values produced NaNs in: {bad}")

    return out[FEATURES + [TARGET]]


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize the real IBM Telco dataset")
    parser.add_argument("--raw", default="data/_raw_telco.csv", help="Raw Telco CSV path")
    parser.add_argument("--out", default="data/telco_churn.csv", help="Normalized output path")
    args = parser.parse_args()

    df = load_and_map(args.raw)
    df.to_csv(args.out, index=False)
    print(f"Mapped {len(df):,} real Telco rows -> {args.out}")
    print(f"Churn rate: {df[TARGET].mean():.1%}")


if __name__ == "__main__":
    main()
