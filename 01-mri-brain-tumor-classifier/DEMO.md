# Demo Guide — Verify Everything Works

Step-by-step guide to verify the MRI classifier is working after setup.

---

## Step 1 — Activate venv and start the API

```bash
cd 01-mri-brain-tumor-classifier
# Windows:  .venv\Scripts\Activate.ps1     macOS/Linux:  source .venv/bin/activate
uvicorn app.main:app --reload
```

Expected output:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Loading MRI model from saved_models/mri_best.keras
INFO:     MRI model loaded.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

> If you haven't trained a model yet you'll instead see
> `MRI model not pre-loaded: ...` — that's fine; `/health` and `/` still work, and
> `/predict/mri` will work once you train (see README step 6).

---

## Step 2 — Open Swagger UI

Go to **http://localhost:8000/docs**. You will see:
- `POST /predict/mri`

---

## Step 3 — Test the health check

```bash
curl http://localhost:8000/health
```
Expected:
```json
{"status": "healthy"}
```

---

## Step 4 — Test MRI prediction (via Swagger UI)

1. Go to `http://localhost:8000/docs`
2. Click **POST /predict/mri** → **"Try it out"**
3. Click **Choose File** and upload any brain MRI JPG/PNG
   (e.g. an image from `data/Testing/glioma/` or `data/Testing/no_tumor/`)
4. Click **Execute**

Expected response:
```json
{
  "prediction": "glioma",
  "confidence": 0.9123,
  "probabilities": {
    "glioma": 0.9123,
    "meningioma": 0.0421,
    "no_tumor": 0.0312,
    "pituitary": 0.0144
  },
  "model_version": "1.0.0"
}
```

---

## Step 5 — Run the tests

```bash
pytest -q
```
Expected:
```
tests/test_mri_api.py::test_health                 PASSED
tests/test_mri_api.py::test_root                   PASSED
tests/test_mri_api.py::test_mri_predict_success    PASSED
tests/test_mri_api.py::test_mri_invalid_content_type PASSED
tests/test_mri_api.py::test_mri_too_large          PASSED

5 passed in X.XXs
```
(The tests mock the Keras model, so they pass without a trained model or dataset.)

---

## Step 6 — Test via curl (optional)

```bash
curl -X POST "http://localhost:8000/predict/mri" -F "file=@brain_scan.jpg"
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `ModuleNotFoundError` | Activate the venv first, and run from inside `01-mri-brain-tumor-classifier/` |
| `FileNotFoundError: mri_best.keras` | Train the model: `python -m ml.mri.train --data_dir ./data` |
| Port 8000 already in use | `uvicorn app.main:app --reload --port 8001` |
| MRI returns wrong prediction | Model needs more training epochs for higher accuracy |
