.PHONY: install install-dev data test api cli docker clean

install:          ## Install runtime dependencies
	pip install -r requirements.txt

install-dev:      ## Install dev + test dependencies
	pip install -r requirements-dev.txt

data:             ## Generate a synthetic transactions dataset
	python data/generate_data.py

test:             ## Run the test suite
	pytest -q

api:              ## Serve the API at http://localhost:8000/docs
	uvicorn app.main:app --reload

cli:              ## Generate sample data and print a report
	python cli.py --generate 500

evaluate:         ## Evaluate anomaly detection on the real fraud dataset
	python evaluation/evaluate_fraud.py

docker:           ## Build + run via docker compose
	docker compose up --build

clean:            ## Remove generated artifacts
	rm -rf data/transactions.csv *.xlsx .pytest_cache **/__pycache__
