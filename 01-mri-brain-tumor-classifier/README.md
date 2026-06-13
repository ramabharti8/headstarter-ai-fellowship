# MRI Brain Tumor Classifier

CNN-based classifier for brain MRI scans with a FastAPI inference endpoint.

## What It Does

Classifies brain MRI images into four categories:
- `glioma` — Glioma tumor
- `meningioma` — Meningioma tumor
- `pituitary` — Pituitary tumor
- `no_tumor` — No tumor detected

## Tech Stack

- **Model**: EfficientNetB0 (transfer learning) via TensorFlow/Keras
- **API**: FastAPI + uvicorn
- **Input**: JPEG/PNG MRI images

## Project Structure

```
01-mri-brain-tumor-classifier/
├── app/
│   ├── main.py       # FastAPI app
│   └── model.py      # CNN model definition & inference
├── requirements.txt
└── README.md
```

## Setup

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## API

```
POST /classify    — Upload an MRI image, get tumor classification
GET  /health      — Health check
```

### Example

```bash
curl -X POST http://localhost:8000/classify \
  -F "file=@brain_mri.jpg"
```

Response:
```json
{
  "prediction": "glioma",
  "confidence": 0.94,
  "probabilities": {
    "glioma": 0.94,
    "meningioma": 0.03,
    "no_tumor": 0.02,
    "pituitary": 0.01
  }
}
```

## Training

To fine-tune on custom data, use the `build_model()` function in `app/model.py` and set `MODEL_WEIGHTS` env var to your saved weights path.

Dataset: [Brain Tumor MRI Dataset — Kaggle](https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset)
