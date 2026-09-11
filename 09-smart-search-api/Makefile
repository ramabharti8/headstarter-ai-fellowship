.PHONY: install lint fmt test run docker-build docker-run

install:
	pip install -r requirements-dev.txt

lint:
	ruff check app tests
	ruff format --check app tests

fmt:
	ruff format app tests
	ruff check --fix app tests

test:
	SS_FAKE_EMBED=1 pytest

run:
	uvicorn app.main:app --reload

docker-build:
	docker build -t smart-search-api .

docker-run:
	docker compose up --build
