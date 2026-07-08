"""Optional MLflow experiment tracking.

Kept out of the core training path so `app.model.train` stays dependency-light
(tests / API don't need MLflow). `train.py --track` calls `log_run` to record
params, metrics, and the model artifact to an MLflow experiment.

Tracking URI defaults to a local `./mlruns` dir; point MLFLOW_TRACKING_URI at a
server for team-wide tracking + a model registry.
"""
from __future__ import annotations

EXPERIMENT = "customer-churn"
REGISTERED_MODEL = "churn-model"


def log_run(metrics: dict, model_path: str, metrics_path: str) -> str:
    """Log one training run to MLflow. Returns the tracking URI."""
    import mlflow
    import mlflow.sklearn

    from app.model import load_model

    mlflow.set_experiment(EXPERIMENT)
    with mlflow.start_run():
        # Params: model hyperparameters + decision policy.
        mlflow.log_params({
            "n_estimators": 300,
            "max_depth": 6,
            "learning_rate": 0.05,
            "subsample": 0.8,
            "colsample_bytree": 0.8,
            "calibrated": metrics.get("calibrated"),
            "threshold": metrics.get("threshold"),
            "cost_ratio_fn_fp": metrics.get("cost_ratio_fn_fp"),
        })
        # Metrics: numeric evaluation results only.
        for k in ("accuracy", "roc_auc", "precision", "recall", "f1", "brier",
                  "n_train", "n_test"):
            if isinstance(metrics.get(k), (int, float)):
                mlflow.log_metric(k, float(metrics[k]))

        model = load_model(model_path)
        try:
            mlflow.sklearn.log_model(model, name="model",
                                     registered_model_name=REGISTERED_MODEL)
        except Exception:
            # Model registry needs a backend store; fall back to plain artifacts.
            try:
                mlflow.sklearn.log_model(model, name="model")
            except Exception:
                mlflow.log_artifact(model_path)
        mlflow.log_artifact(metrics_path)

    return mlflow.get_tracking_uri()
