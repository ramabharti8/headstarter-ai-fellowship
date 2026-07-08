.PHONY: install install-dev data train test api ui docker clean drift retrain

install:          ## Install runtime dependencies
	pip install -r requirements.txt

install-dev:      ## Install dev + analysis dependencies
	pip install -r requirements-dev.txt

data:             ## Generate the synthetic dataset
	python data/generate_data.py

train:            ## Train the model (generates data if missing)
	python train.py

test:             ## Run the test suite
	pytest -q

api:              ## Serve the REST API at http://localhost:8000/docs
	uvicorn app.main:app --reload

ui:               ## Launch the Streamlit demo at http://localhost:8501
	streamlit run streamlit_app.py

drift:            ## Generate a data-drift report from the prediction log
	python monitoring/drift.py

retrain:          ## Retrain with the champion/challenger promotion gate
	python scripts/promote.py

docker:           ## Build + run API and UI via docker compose
	docker compose up --build

clean:            ## Remove generated artifacts
	rm -rf models data/telco_churn.csv .pytest_cache **/__pycache__
