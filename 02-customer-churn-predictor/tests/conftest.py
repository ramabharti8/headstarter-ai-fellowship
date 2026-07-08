"""Shared pytest fixtures: a small trained pipeline reused across tests."""
import pytest

from app.model import train
from data.generate_data import generate


@pytest.fixture(scope="session")
def sample_df():
    return generate(2000, seed=7)


@pytest.fixture(scope="session")
def trained_pipeline(sample_df):
    # Train in-memory without writing artifacts to disk.
    from app.model import build_pipeline, FEATURES, TARGET
    from sklearn.model_selection import train_test_split

    X, y = sample_df[FEATURES], sample_df[TARGET]
    X_train, _, y_train, _ = train_test_split(X, y, test_size=0.2, random_state=0, stratify=y)
    n_pos, n_neg = int((y_train == 1).sum()), int((y_train == 0).sum())
    pipe = build_pipeline(scale_pos_weight=n_neg / n_pos)
    pipe.fit(X_train, y_train)
    return pipe


@pytest.fixture
def sample_customer():
    return {
        "tenure": 24, "monthly_charges": 79.5, "total_charges": 1908.0,
        "num_products": 3, "has_internet": 1, "has_phone": 1,
        "contract_type": 1, "payment_method": 2,
        "paperless_billing": 1, "senior_citizen": 0,
    }
