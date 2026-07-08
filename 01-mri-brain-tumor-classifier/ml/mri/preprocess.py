"""MRI image preprocessing pipeline."""
import cv2
import numpy as np
from pathlib import Path


IMG_SIZE = 224
CLASS_NAMES = ["glioma", "meningioma", "no_tumor", "pituitary"]


def load_and_preprocess(image_path: str | Path) -> np.ndarray:
    """Load an image file and return preprocessed numpy array (1, 224, 224, 3)."""
    img = cv2.imread(str(image_path))
    if img is None:
        raise ValueError(f"Could not read image: {image_path}")
    return preprocess_array(img)


def preprocess_array(img: np.ndarray) -> np.ndarray:
    """Preprocess a raw BGR numpy array to model-ready tensor."""
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    img = cv2.resize(img, (IMG_SIZE, IMG_SIZE))
    img = img.astype(np.float32) / 255.0
    # VGG-16 mean subtraction
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    img = (img - mean) / std
    return np.expand_dims(img, axis=0)


def preprocess_bytes(image_bytes: bytes) -> np.ndarray:
    """Preprocess raw image bytes (from HTTP upload) to model-ready tensor."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image bytes")
    return preprocess_array(img)


def load_dataset(data_dir: str | Path, split: float = 0.2):
    """
    Load MRI dataset from directory structure:
        data_dir/
            Training/
                glioma/  meningioma/  no_tumor/  pituitary/
            Testing/
                ...
    Returns (X_train, y_train), (X_val, y_val), (X_test, y_test)
    """
    data_dir = Path(data_dir)
    X, y = [], []

    for class_idx, class_name in enumerate(CLASS_NAMES):
        for subset in ["Training", "Testing"]:
            class_dir = data_dir / subset / class_name
            if not class_dir.exists():
                continue
            for img_path in class_dir.glob("*.jpg"):
                try:
                    tensor = load_and_preprocess(img_path)
                    X.append(tensor[0])
                    y.append(class_idx)
                except Exception:
                    continue

    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.int32)

    indices = np.random.permutation(len(X))
    X, y = X[indices], y[indices]

    val_size = int(len(X) * split)
    X_val, y_val = X[:val_size], y[:val_size]
    X_train, y_train = X[val_size:], y[val_size:]

    return (X_train, y_train), (X_val, y_val)
