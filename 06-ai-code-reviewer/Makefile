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
	CR_FAKE_AI=1 pytest

run:
	uvicorn app.main:app --reload

docker-build:
	docker build -t ai-code-reviewer .

docker-run:
	docker compose up --build
