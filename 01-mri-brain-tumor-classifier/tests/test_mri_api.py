"""Tests for the MRI classification endpoint."""
import io
import numpy as np
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _make_fake_image_bytes() -> bytes:
    """Create a minimal valid JPEG-like byte sequence for testing."""
    from PIL import Image
    img = Image.fromarray(np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


@pytest.fixture
def mock_mri_model():
    mock = MagicMock()
    # Simulate softmax output: shape (1, 4)
    mock.predict.return_value = np.array([[0.85, 0.07, 0.05, 0.03]])
    with patch("app.routers.mri.get_model", return_value=mock):
        yield mock


def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "healthy"


def test_root():
    resp = client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert "mri_classifier" in data["endpoints"]


def test_mri_predict_success(mock_mri_model):
    image_bytes = _make_fake_image_bytes()
    resp = client.post(
        "/predict/mri",
        files={"file": ("test.jpg", image_bytes, "image/jpeg")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["prediction"] in ["glioma", "meningioma", "no_tumor", "pituitary"]
    assert 0.0 <= data["confidence"] <= 1.0
    assert len(data["probabilities"]) == 4
    assert abs(sum(data["probabilities"].values()) - 1.0) < 0.01


def test_mri_invalid_content_type():
    resp = client.post(
        "/predict/mri",
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert resp.status_code == 400


def test_mri_too_large(mock_mri_model):
    large_bytes = b"x" * (11 * 1024 * 1024)
    resp = client.post(
        "/predict/mri",
        files={"file": ("big.jpg", large_bytes, "image/jpeg")},
    )
    assert resp.status_code == 413
