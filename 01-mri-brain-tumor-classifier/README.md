# MRI Brain Tumor Classifier

CNN-based brain-MRI tumor classification using **VGG-16 transfer learning**
(TensorFlow/Keras), served as a production-ready **FastAPI** REST endpoint.
Classifies a brain MRI scan into one of four classes: **glioma, meningioma,
pituitary, or no_tumor**.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-2.19-orange)](https://tensorflow.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109-green)](https://fastapi.tiangolo.com)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## What it does

Upload a brain MRI image (JPG/PNG) to `POST /predict/mri` and get back the
predicted tumor type, a confidence score, and the full probability distribution
across all four classes.

## Model

- **Architecture**: VGG-16 pretrained on ImageNet, with a custom classification
  head (GlobalAveragePooling → Dense 512 → Dense 256 → Softmax 4).
- **Training**: two-phase transfer learning — (1) train the head with the VGG-16
  backbone frozen, then (2) unfreeze the top VGG-16 layers and fine-tune at a low
  learning rate.
- **Input**: 224×224 RGB, normalized with ImageNet mean/std.
- **Regularization**: L2 on dense layers + dropout (0.5, 0.3), early stopping,
  `ReduceLROnPlateau`.

## Project Structure

```
01-mri-brain-tumor-classifier/
├── app/                        # FastAPI application
│   ├── main.py                 # App entry point, CORS, lifespan model loader
│   ├── routers/mri.py          # POST /predict/mri endpoint
│   ├── models/mri_model.py     # Singleton Keras model loader
│   └── schemas/mri_schema.py   # Pydantic response schema
├── ml/mri/                     # Training pipeline
│   ├── model.py                # VGG-16 architecture
│   ├── preprocess.py           # Image preprocessing + dataset loader
│   ├── train.py                # 2-phase training script
│   └── evaluate.py             # Confusion matrix + training plots
├── notebooks/mri_eda.ipynb     # Dataset EDA + model walkthrough
├── tests/test_mri_api.py       # API tests (model mocked)
├── saved_models/               # Trained weights land here (git-ignored)
├── Dockerfile / docker-compose.yml
├── requirements.txt
├── DEMO.md                     # Step-by-step verification guide
└── LICENSE                     # MIT
```

---

## Run on a fresh machine (step by step)

Works on Windows, macOS, and Linux.

### 0. Prerequisites
- **Git** and **Python 3.11** (`python --version`; use `python3` on macOS/Linux)

### 1. Clone and enter the project
```bash
git clone https://github.com/ramabharti8/headstarter-ai-fellowship.git
cd headstarter-ai-fellowship/01-mri-brain-tumor-classifier
```

### 2. Create and activate a virtual environment
```bash
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the tests (no dataset or model needed — the model is mocked)
```bash
pytest -q
```

### 5. Start the API
```bash
uvicorn app.main:app --reload      # open http://localhost:8000/docs
```
`GET /health` and `GET /` work immediately. `POST /predict/mri` needs a trained
model (step 6).

### 6. (Optional) Train the model for real predictions
```bash
# Download the dataset (~165 MB) from Kaggle:
#   https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset
# Unzip so you have  data/Training/<class>/  and  data/Testing/<class>/
python -m ml.mri.train --data_dir ./data --epochs 20 --fine_tune_epochs 10
```
This writes `saved_models/mri_best.keras`, which the API loads on startup.
Training is much faster on a GPU but runs on CPU too.

> **Why isn't the model/dataset in the repo?** The trained weights and the MRI
> dataset are large binaries and are intentionally **git-ignored** — you train
> them locally in step 6. The API and tests are structured so you can verify the
> service (steps 4–5) without them.

### Troubleshooting
| Problem | Fix |
|---------|-----|
| `python: command not found` | Use `python3` (macOS/Linux) |
| `ModuleNotFoundError: app` | Run commands from **inside** `01-mri-brain-tumor-classifier/` |
| `FileNotFoundError: mri_best.keras` on `/predict/mri` | Train the model (step 6) |
| `Address already in use` | Add `--port 8001` to the `uvicorn` command |
| OpenCV import error on Linux | `apt-get install -y libgl1-mesa-glx libglib2.0-0` |

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/health` | Health check |
| `GET`  | `/` | Service metadata |
| `POST` | `/predict/mri` | Classify an uploaded brain MRI image |

### Example
```bash
curl -X POST http://localhost:8000/predict/mri \
  -F "file=@brain_scan.jpg"
```
```json
{
  "prediction": "glioma",
  "confidence": 0.9123,
  "probabilities": {
    "glioma": 0.9123, "meningioma": 0.0421,
    "no_tumor": 0.0312, "pituitary": 0.0144
  },
  "model_version": "1.0.0"
}
```

Validation: only JPEG/PNG accepted (else 400), 10 MB max (else 413), undecodable
images return 422.

## Run with Docker
```bash
docker compose up --build      # API on http://localhost:8000
```

## Testing
```bash
pytest -q
```
The tests mock the Keras model, so they run fast and need no dataset — they cover
the health/root endpoints, a successful prediction, invalid content type (400),
and oversized upload (413).

## License
MIT — see [LICENSE](LICENSE).
