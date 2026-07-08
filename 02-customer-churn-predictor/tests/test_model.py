"""Unit tests for the model layer."""
from app.model import FEATURES, feature_importance, predict_churn, train


def test_data_has_signal(sample_df):
    assert set(FEATURES).issubset(sample_df.columns)
    assert "churn" in sample_df.columns
    rate = sample_df["churn"].mean()
    assert 0.1 < rate < 0.4  # realistic, imbalanced but not degenerate


def test_train_returns_reasonable_metrics(sample_df):
    metrics = train(sample_df, save=False)
    assert metrics["roc_auc"] > 0.8          # model genuinely learns the signal
    assert metrics["recall"] > 0.5           # actually catches churners
    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert set(metrics["feature_importance"]) == set(FEATURES)


def test_train_rejects_missing_columns(sample_df):
    import pytest
    bad = sample_df.drop(columns=["tenure"])
    with pytest.raises(ValueError):
        train(bad, save=False)


def test_predict_shape_and_bounds(trained_pipeline, sample_customer):
    result = predict_churn(trained_pipeline, sample_customer)
    assert set(result) == {"churn_probability", "will_churn", "risk_level"}
    assert 0.0 <= result["churn_probability"] <= 1.0
    assert result["risk_level"] in {"low", "medium", "high"}
    assert isinstance(result["will_churn"], bool)


def test_high_risk_profile_scores_higher_than_low(trained_pipeline, sample_customer):
    # New month-to-month, e-check, pricey customer vs loyal two-year customer.
    high = {**sample_customer, "tenure": 1, "contract_type": 0,
            "payment_method": 0, "monthly_charges": 110.0, "num_products": 1}
    low = {**sample_customer, "tenure": 70, "contract_type": 2,
           "payment_method": 3, "monthly_charges": 25.0, "num_products": 4}
    assert (predict_churn(trained_pipeline, high)["churn_probability"]
            > predict_churn(trained_pipeline, low)["churn_probability"])


def test_feature_importance_sums_to_one(trained_pipeline):
    imp = feature_importance(trained_pipeline)
    assert abs(sum(imp.values()) - 1.0) < 0.05
