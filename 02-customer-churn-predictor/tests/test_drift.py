"""Tests for the PSI-based drift monitor."""
import numpy as np

from monitoring.drift import compute_drift, psi


def test_psi_zero_for_same_distribution():
    rng = np.random.default_rng(0)
    x = rng.normal(size=5000)
    assert psi(x, x) < 0.01


def test_psi_large_for_shifted_distribution():
    rng = np.random.default_rng(0)
    ref = rng.normal(0, 1, size=5000)
    cur = rng.normal(3, 1, size=5000)  # big mean shift
    assert psi(ref, cur) > 0.2


def test_compute_drift_flags_shifted_feature(sample_df):
    reference = sample_df.copy()
    current = sample_df.copy()
    # Simulate a population change: everyone suddenly has long tenure.
    current["tenure"] = current["tenure"] + 40

    summary = compute_drift(reference, current)
    assert summary["n_features"] == 10
    assert "tenure" in summary["drifted_features"]
    assert summary["per_feature"]["tenure"]["level"] == "significant"


def test_compute_drift_stable_when_identical(sample_df):
    summary = compute_drift(sample_df, sample_df)
    assert summary["n_drifted"] == 0
    assert summary["share_drifted"] == 0.0
