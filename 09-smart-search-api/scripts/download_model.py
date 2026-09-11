"""Pre-fetch the default fastembed (local ONNX) model into its cache dir.

Run at Docker build time so a container using the zero-API-key default
doesn't pay a ~130MB download on its first request. No-ops safely if
fastembed isn't installed or the download can't complete (e.g. building
offline while targeting a hosted provider instead).
"""

from __future__ import annotations

import os

MODEL = os.environ.get("SS_FASTEMBED_MODEL", "BAAI/bge-small-en-v1.5")


def main() -> None:
    try:
        from fastembed import TextEmbedding
    except ImportError:
        print("fastembed not installed — skipping.")
        return
    print(f"Downloading {MODEL} …")
    TextEmbedding(model_name=MODEL)
    print("Done.")


if __name__ == "__main__":
    main()
