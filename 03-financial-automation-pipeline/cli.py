"""Command-line interface for the financial pipeline.

    python cli.py data/transactions.csv                     # print JSON report
    python cli.py data/transactions.csv --excel report.xlsx # also write Excel
    python cli.py --generate 500                            # make + analyze sample data
    python cli.py data/tx.csv --method isolation_forest
"""
from __future__ import annotations

import argparse
import json

import pandas as pd

from app.pipeline import ANOMALY_METHODS, generate_report, validate_and_clean
from app.report import report_to_excel


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze a transactions file")
    parser.add_argument("file", nargs="?", help="Path to CSV/Excel transactions file")
    parser.add_argument("--generate", type=int, metavar="N",
                        help="Generate N sample rows to data/transactions.csv and analyze")
    parser.add_argument("--method", choices=ANOMALY_METHODS, default="zscore")
    parser.add_argument("--threshold", type=float, default=3.0)
    parser.add_argument("--excel", metavar="PATH", help="Also write an .xlsx report here")
    args = parser.parse_args()

    if args.generate:
        from data.generate_data import generate
        df = generate(args.generate)
        path = "data/transactions.csv"
        import os
        os.makedirs("data", exist_ok=True)
        df.to_csv(path, index=False)
        print(f"Generated {len(df):,} rows -> {path}")
    elif args.file:
        raw = pd.read_csv(args.file) if args.file.lower().endswith(".csv") else pd.read_excel(args.file)
        df = validate_and_clean(raw)
    else:
        parser.error("Provide a file path or --generate N")

    report = generate_report(df, method=args.method, threshold=args.threshold)
    print(json.dumps(report, indent=2, default=str))

    if args.excel:
        with open(args.excel, "wb") as f:
            f.write(report_to_excel(report))
        print(f"\nExcel report written to {args.excel}")


if __name__ == "__main__":
    main()
