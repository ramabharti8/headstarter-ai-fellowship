"""Evaluation utilities for MRI classifier."""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import classification_report, confusion_matrix
from pathlib import Path


PLOTS_DIR = Path("plots")


def evaluate_model(model, X_val, y_val, class_names):
    PLOTS_DIR.mkdir(exist_ok=True)
    y_pred_probs = model.predict(X_val, verbose=0)
    y_pred = np.argmax(y_pred_probs, axis=1)

    print("\nClassification Report:")
    print(classification_report(y_val, y_pred, target_names=class_names))

    cm = confusion_matrix(y_val, y_pred)
    plt.figure(figsize=(8, 6))
    sns.heatmap(
        cm, annot=True, fmt="d", cmap="Blues",
        xticklabels=class_names, yticklabels=class_names,
    )
    plt.title("MRI Classifier — Confusion Matrix")
    plt.ylabel("True Label")
    plt.xlabel("Predicted Label")
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "mri_confusion_matrix.png", dpi=150)
    plt.close()
    print(f"Confusion matrix saved to {PLOTS_DIR / 'mri_confusion_matrix.png'}")


def plot_training_history(history1, history2=None):
    PLOTS_DIR.mkdir(exist_ok=True)
    acc = history1.history["accuracy"]
    val_acc = history1.history["val_accuracy"]
    loss = history1.history["loss"]
    val_loss = history1.history["val_loss"]

    if history2:
        acc += history2.history["accuracy"]
        val_acc += history2.history["val_accuracy"]
        loss += history2.history["loss"]
        val_loss += history2.history["val_loss"]

    epochs_range = range(len(acc))
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

    ax1.plot(epochs_range, acc, label="Train Acc")
    ax1.plot(epochs_range, val_acc, label="Val Acc")
    if history2:
        ax1.axvline(x=len(history1.history["accuracy"]) - 0.5, color="gray", linestyle="--", label="Fine-tune start")
    ax1.set_title("Accuracy")
    ax1.legend()

    ax2.plot(epochs_range, loss, label="Train Loss")
    ax2.plot(epochs_range, val_loss, label="Val Loss")
    if history2:
        ax2.axvline(x=len(history1.history["loss"]) - 0.5, color="gray", linestyle="--", label="Fine-tune start")
    ax2.set_title("Loss")
    ax2.legend()

    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "mri_training_history.png", dpi=150)
    plt.close()
    print(f"Training history saved to {PLOTS_DIR / 'mri_training_history.png'}")
