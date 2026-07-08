"""Shared fixtures."""
import pytest

from data.generate_data import generate


@pytest.fixture(scope="session")
def sample_df():
    return generate(500, seed=7)


@pytest.fixture(scope="session")
def sample_csv_bytes(sample_df):
    return sample_df.to_csv(index=False).encode()
