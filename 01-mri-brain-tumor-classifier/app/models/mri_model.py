"""Singleton loader for the MRI Keras model."""
from pathlib import Path
from loguru import logger

_model = None
MODEL_PATH = Path("saved_models/mri_best.keras")


def get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"MRI model not found at {MODEL_PATH}. "
                "Run: python -m ml.mri.train --data_dir <path>"
            )
        import tensorflow as tf
        logger.info(f"Loading MRI model from {MODEL_PATH}")
        _model = tf.keras.models.load_model(str(MODEL_PATH))
        logger.info("MRI model loaded.")
    return _model
