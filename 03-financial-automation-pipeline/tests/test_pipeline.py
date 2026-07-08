"""Unit tests for the pipeline layer."""
import pandas as pd
import pytest

from app.pipeline import (
    PipelineError,
    detect_anomalies,
    generate_report,
    load_transactions,
    validate_and_clean,
)


def test_load_csv_bytes(sample_csv_bytes):
    df = load_transactions(sample_csv_bytes, "transactions.csv")
    assert {"date", "amount"}.issubset(df.columns)
    assert len(df) > 0


def test_missing_required_column_raises():
    df = pd.DataFrame({"date": ["2024-01-01"], "value": [10]})
    with pytest.raises(PipelineError):
        validate_and_clean(df)


def test_unsupported_file_type_raises():
    with pytest.raises(PipelineError):
        load_transactions(b"irrelevant", "data.txt")


def test_invalid_rows_are_dropped():
    df = pd.DataFrame({
        "date": ["2024-01-01", "not-a-date", "2024-01-03"],
        "amount": [10.0, 20.0, "bad"],
    })
    clean = validate_and_clean(df)
    assert len(clean) == 1
    assert clean.attrs["dropped_rows"] == 2


@pytest.mark.parametrize("method", ["zscore", "iqr", "isolation_forest"])
def test_detect_anomalies_methods(sample_df, method):
    flagged = detect_anomalies(sample_df, method=method)
    assert "is_anomaly" in flagged.columns
    assert "anomaly_score" in flagged.columns
    # injected anomalies should surface at least one flag
    assert flagged["is_anomaly"].sum() >= 1


def test_zscore_flags_the_injected_outlier():
    df = pd.DataFrame({
        "date": pd.date_range("2024-01-01", periods=11, freq="D"),
        "amount": [-50] * 10 + [-9000],   # one huge outlier
    })
    flagged = detect_anomalies(df, method="zscore", threshold=2.5)
    assert bool(flagged.iloc[-1]["is_anomaly"]) is True
    assert flagged["is_anomaly"].sum() == 1


def test_isolation_forest_multivariate_feature_columns():
    # Two normal features + a handful of joint outliers.
    import numpy as np
    rng = np.random.default_rng(0)
    n = 300
    df = pd.DataFrame({
        "date": pd.date_range("2024-01-01", periods=n, freq="h"),
        "amount": rng.normal(50, 5, n),
        "f2": rng.normal(0, 1, n),
    })
    df.loc[:4, ["amount", "f2"]] = [500, 20]  # obvious multivariate outliers
    flagged = detect_anomalies(df, method="isolation_forest",
                               feature_columns=["amount", "f2"])
    assert flagged.loc[:4, "is_anomaly"].all()


def test_report_structure_and_cashflow(sample_df):
    report = generate_report(sample_df)
    assert set(report) >= {"summary", "cash_flow", "monthly_breakdown", "anomalies"}
    cf = report["cash_flow"]
    assert abs((cf["total_income"] + cf["total_expense"]) - cf["net"]) < 0.01
    assert report["summary"]["total_transactions"] == len(sample_df)
    # sample data has categories + merchants -> breakdowns present
    assert "category_breakdown" in report
    assert "top_merchants" in report
