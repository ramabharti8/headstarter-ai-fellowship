"""
MRI tumor classifier training script.

Usage:
    python -m ml.mri.train --data_dir ./data --epochs 20 --fine_tune_epochs 10

Dataset expected layout:
    data/
        Training/
            glioma/  meningioma/  no_tumor/  pituitary/
        Testing/
            ...

Download from: https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset
"""
import argparse
from pathlib import Path

import numpy as np
import tensorflow as tf
from tensorflow.keras.callbacks import (
    EarlyStopping,
    ModelCheckpoint,
    ReduceLROnPlateau,
    TensorBoard,
)

from ml.mri.model import build_model, compile_model, unfreeze_top_layers
from ml.mri.preprocess import load_dataset, CLASS_NAMES
from ml.mri.evaluate import plot_training_history, evaluate_model


SAVED_MODELS_DIR = Path("saved_models")


def get_callbacks(checkpoint_path: Path):
    return [
        ModelCheckpoint(
            str(checkpoint_path),
            save_best_only=True,
            monitor="val_accuracy",
            mode="max",
            verbose=1,
        ),
        EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
        ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-7),
        TensorBoard(log_dir="logs/mri"),
    ]


def train(data_dir: str, epochs: int = 20, fine_tune_epochs: int = 10, batch_size: int = 32):
    print("Loading dataset...")
    (X_train, y_train), (X_val, y_val) = load_dataset(data_dir)
    print(f"Train: {len(X_train)} | Val: {len(X_val)}")

    # --- Phase 1: Train head only ---
    print("\n=== Phase 1: Training classifier head ===")
    model = build_model()
    compile_model(model, learning_rate=1e-3)
    model.summary()

    SAVED_MODELS_DIR.mkdir(exist_ok=True)
    checkpoint_path = SAVED_MODELS_DIR / "mri_best.keras"

    history1 = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=get_callbacks(checkpoint_path),
    )

    # --- Phase 2: Fine-tune top VGG layers ---
    print("\n=== Phase 2: Fine-tuning top VGG-16 layers ===")
    unfreeze_top_layers(model, fine_tune_at=15)
    compile_model(model, learning_rate=1e-5)

    history2 = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=fine_tune_epochs,
        batch_size=batch_size,
        callbacks=get_callbacks(checkpoint_path),
    )

    print("\n=== Evaluation ===")
    evaluate_model(model, X_val, y_val, CLASS_NAMES)
    plot_training_history(history1, history2)

    model.save(str(SAVED_MODELS_DIR / "mri_final.keras"))
    print(f"Model saved to {SAVED_MODELS_DIR / 'mri_final.keras'}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", type=str, required=True)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--fine_tune_epochs", type=int, default=10)
    parser.add_argument("--batch_size", type=int, default=32)
    args = parser.parse_args()

    train(args.data_dir, args.epochs, args.fine_tune_epochs, args.batch_size)
