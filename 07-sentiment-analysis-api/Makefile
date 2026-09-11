.PHONY: install install-ci lint fmt test run download docker-build docker-run

install:
	pip install -r requirements-dev.txt

install-ci:
	pip install -r requirements-ci.txt

lint:
	ruff check app tests
	ruff format --check app tests

fmt:
	ruff format app tests
	ruff check --fix app tests

test:
	SENT_FAKE_MODEL=1 pytest

run:
	uvicorn app.main:app --reload

download:
	python scripts/download_model.py

docker-build:
	docker build -t sentiment-analysis-api .

docker-run:
	docker compose up --build
