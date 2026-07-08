"""Generate a realistic synthetic transactions dataset for the pipeline.

Produces a year of personal/SMB-style transactions with signed amounts
(positive = income, negative = expense), categories, and merchants, plus a
small number of injected anomalies (unusually large charges) so the anomaly
detector has something real to find.

Usage:
    python data/generate_data.py --rows 2500 --out data/transactions.csv
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

# category -> (typical merchants, mean spend, std spend)
EXPENSE_CATEGORIES = {
    "Groceries": (["Walmart", "Costco", "Whole Foods", "Trader Joe's"], 85, 40),
    "Dining": (["Chipotle", "Starbucks", "McDonald's", "Local Cafe"], 25, 15),
    "Transport": (["Uber", "Shell", "Lyft", "Transit Authority"], 40, 25),
    "Utilities": (["PG&E", "Comcast", "AT&T", "City Water"], 120, 45),
    "Entertainment": (["Netflix", "Spotify", "AMC", "Steam"], 30, 20),
    "Healthcare": (["CVS Pharmacy", "Kaiser", "Dental Care"], 90, 60),
    "Shopping": (["Amazon", "Target", "Best Buy", "IKEA"], 110, 80),
    "Rent": (["Property Mgmt LLC"], 1800, 50),
}
INCOME_MERCHANTS = ["Acme Corp Payroll", "Freelance Client", "Interest Payment"]


def generate(n_rows: int, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    start = pd.Timestamp("2024-01-01")
    records = []

    # Monthly salary (income) on the 1st of each month
    for month in range(12):
        pay_date = start + pd.DateOffset(months=month)
        records.append({
            "date": pay_date,
            "amount": round(float(rng.normal(5200, 150)), 2),
            "category": "Salary",
            "merchant": "Acme Corp Payroll",
            "description": "Monthly salary",
        })
        # Monthly rent (expense)
        records.append({
            "date": pay_date + pd.Timedelta(days=2),
            "amount": -round(float(rng.normal(1800, 30)), 2),
            "category": "Rent",
            "merchant": "Property Mgmt LLC",
            "description": "Apartment rent",
        })

    # Remaining rows: random expenses across the year
    cats = [c for c in EXPENSE_CATEGORIES if c != "Rent"]
    for _ in range(max(0, n_rows - len(records))):
        cat = rng.choice(cats)
        merchants, mean, std = EXPENSE_CATEGORIES[cat]
        day = int(rng.integers(0, 365))
        amount = -abs(float(rng.normal(mean, std)))
        records.append({
            "date": start + pd.Timedelta(days=day),
            "amount": round(amount, 2),
            "category": cat,
            "merchant": rng.choice(merchants),
            "description": f"{cat} purchase",
        })

    df = pd.DataFrame(records)

    # Inject ~1% anomalies: unusually large charges
    n_anom = max(3, int(len(df) * 0.01))
    idx = rng.choice(df.index, size=n_anom, replace=False)
    df.loc[idx, "amount"] = -abs(rng.normal(6000, 1500, size=n_anom)).round(2)
    df.loc[idx, "description"] = "UNUSUAL LARGE CHARGE"

    df = df.sort_values("date").reset_index(drop=True)
    df["transaction_id"] = [f"TXN{100000 + i}" for i in range(len(df))]
    return df[["transaction_id", "date", "amount", "category", "merchant", "description"]]


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic transactions")
    parser.add_argument("--rows", type=int, default=2500)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=str, default="data/transactions.csv")
    args = parser.parse_args()

    df = generate(args.rows, args.seed)
    df.to_csv(args.out, index=False)
    print(f"Wrote {len(df):,} transactions to {args.out}")
    print(f"Date range: {df['date'].min().date()} -> {df['date'].max().date()}")
    print(f"Net cash flow: {df['amount'].sum():,.2f}")


if __name__ == "__main__":
    main()
