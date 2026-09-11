"""Pre-fetch the model + tokenizer into the local HF cache.

Run at Docker build time so the container starts instantly and works with no
network at runtime. Honours SENT_MODEL_NAME.
"""

from __future__ import annotations

import os

from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL = os.environ.get(
    "SENT_MODEL_NAME", "cardiffnlp/twitter-roberta-base-sentiment-latest"
)


def main() -> None:
    print(f"Downloading {MODEL} …")
    AutoTokenizer.from_pretrained(MODEL)
    AutoModelForSequenceClassification.from_pretrained(MODEL)
    print("Done.")


if __name__ == "__main__":
    main()
