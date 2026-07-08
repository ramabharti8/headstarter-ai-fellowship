"""Generate a realistic synthetic Telco-style customer churn dataset.

Real churn data (e.g. IBM Telco) can't always be redistributed, so this script
builds a dataset with the *same feature schema* and realistic churn dynamics:
short-tenure, month-to-month, high-bill, electronic-check customers churn more;
bundled (multi-product) long-contract customers stay. Churn is a noisy logistic
function of the features, so a model can learn it (~90% accuracy) without it
being trivially separable.

Usage:
    python data/generate_data.py --rows 7043 --out data/telco_churn.csv
"""
from __future__ import annotations

import argparse

import numpy as np
import pandas as pd

# Feature order must match app/model.py FEATURES
FEATURES = [
    "tenure", "monthly_charges", "total_charges", "num_products",
    "has_internet", "has_phone", "contract_type", "payment_method",
    "paperless_billing", "senior_citizen",
]


def generate(n_rows: int, seed: int = 42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # --- Raw customer attributes -------------------------------------------
    tenure = rng.integers(0, 73, size=n_rows)                      # months, 0-72
    contract_type = rng.choice([0, 1, 2], size=n_rows, p=[0.55, 0.21, 0.24])
    has_internet = rng.binomial(1, 0.78, size=n_rows)
    has_phone = rng.binomial(1, 0.90, size=n_rows)
    senior_citizen = rng.binomial(1, 0.16, size=n_rows)
    paperless_billing = rng.binomial(1, 0.59, size=n_rows)
    payment_method = rng.choice([0, 1, 2, 3], size=n_rows, p=[0.34, 0.22, 0.22, 0.22])
    # 0 = electronic check (churn-prone), 1 = mailed check,
    # 2 = bank transfer (auto), 3 = credit card (auto)

    num_products = 1 + has_internet + has_phone + rng.integers(0, 3, size=n_rows)
    num_products = np.clip(num_products, 1, 5)

    # Monthly charges rise with internet + product count, plus noise
    monthly_charges = (
        20
        + has_internet * 35
        + has_phone * 10
        + num_products * 6
        + rng.normal(0, 6, size=n_rows)
    ).clip(18, 120).round(2)

    total_charges = (monthly_charges * tenure * rng.uniform(0.95, 1.05, size=n_rows)).round(2)

    # --- Churn as a noisy logistic function of the drivers -----------------
    logit = (
        2.1                                      # base rate -> ~26% churn (Telco-like)
        - 0.095 * tenure                        # loyalty lowers churn
        + 0.030 * (monthly_charges - 65)        # pricey plans churn more
        - 1.75 * contract_type                  # longer contracts stay
        + 1.30 * (payment_method == 0)          # electronic check churns
        + 0.60 * senior_citizen
        + 0.50 * paperless_billing
        - 0.45 * num_products                   # bundling retains
        + 0.55 * has_internet                   # fiber/internet friction
    )
    prob = 1 / (1 + np.exp(-logit))
    churn = rng.binomial(1, prob)

    df = pd.DataFrame({
        "customer_id": [f"C{100000 + i}" for i in range(n_rows)],
        "tenure": tenure,
        "monthly_charges": monthly_charges,
        "total_charges": total_charges,
        "num_products": num_products,
        "has_internet": has_internet,
        "has_phone": has_phone,
        "contract_type": contract_type,
        "payment_method": payment_method,
        "paperless_billing": paperless_billing,
        "senior_citizen": senior_citizen,
        "churn": churn,
    })
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic churn dataset")
    parser.add_argument("--rows", type=int, default=7043)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=str, default="data/telco_churn.csv")
    args = parser.parse_args()

    df = generate(args.rows, args.seed)
    df.to_csv(args.out, index=False)
    rate = df["churn"].mean()
    print(f"Wrote {len(df):,} rows to {args.out}")
    print(f"Churn rate: {rate:.1%}  |  columns: {list(df.columns)}")


if __name__ == "__main__":
    main()
