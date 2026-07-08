"""Interactive Streamlit demo for the churn model.

Loads the trained pipeline directly (no API needed) and lets you tweak a
customer's attributes to see the churn probability and risk level update live.

    streamlit run streamlit_app.py
"""
from __future__ import annotations

import json
import os

import pandas as pd
import streamlit as st

from app.model import FEATURES, feature_importance, load_model, predict_churn

MODEL_PATH = os.environ.get("MODEL_PATH", "models/churn_model.joblib")
METRICS_PATH = os.environ.get("METRICS_PATH", "models/metrics.json")

st.set_page_config(page_title="Customer Churn Predictor", page_icon="📉", layout="wide")

CONTRACTS = {"Month-to-month": 0, "One year": 1, "Two year": 2}
PAYMENTS = {"Electronic check": 0, "Mailed check": 1, "Bank transfer": 2, "Credit card": 3}
RISK_COLORS = {"high": "#e5484d", "medium": "#f5a623", "low": "#30a46c"}


@st.cache_resource
def get_model():
    if not os.path.exists(MODEL_PATH):
        return None
    return load_model(MODEL_PATH)


def get_metrics():
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH) as f:
            return json.load(f)
    return None


st.title("📉 Customer Churn Predictor")
st.caption("XGBoost model predicting the probability a telecom customer will churn.")

pipeline = get_model()
if pipeline is None:
    st.error("No trained model found. Run `python train.py` first, then reload.")
    st.stop()

metrics = get_metrics()
if metrics:
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("ROC-AUC", f"{metrics.get('roc_auc', 0):.3f}")
    c2.metric("Accuracy", f"{metrics.get('accuracy', 0):.1%}")
    c3.metric("Recall (churn)", f"{metrics.get('recall', 0):.1%}")
    c4.metric("Precision (churn)", f"{metrics.get('precision', 0):.1%}")

st.divider()
left, right = st.columns([1, 1])

with left:
    st.subheader("Customer profile")
    tenure = st.slider("Tenure (months)", 0, 72, 12)
    monthly_charges = st.slider("Monthly charges ($)", 18.0, 120.0, 70.0)
    total_charges = st.number_input("Total charges ($)", 0.0, 10000.0,
                                    float(round(tenure * monthly_charges, 2)))
    num_products = st.slider("Number of products", 1, 5, 2)
    contract = st.selectbox("Contract type", list(CONTRACTS))
    payment = st.selectbox("Payment method", list(PAYMENTS))
    cola, colb, colc = st.columns(3)
    has_internet = 1 if cola.checkbox("Internet", True) else 0
    has_phone = 1 if colb.checkbox("Phone", True) else 0
    senior = 1 if colc.checkbox("Senior", False) else 0
    paperless = 1 if st.checkbox("Paperless billing", True) else 0

customer = {
    "tenure": tenure, "monthly_charges": monthly_charges, "total_charges": total_charges,
    "num_products": num_products, "has_internet": has_internet, "has_phone": has_phone,
    "contract_type": CONTRACTS[contract], "payment_method": PAYMENTS[payment],
    "paperless_billing": paperless, "senior_citizen": senior,
}
threshold = float(metrics.get("threshold", 0.5)) if metrics else 0.5
result = predict_churn(pipeline, customer, threshold=threshold)

with right:
    st.subheader("Prediction")
    prob = result["churn_probability"]
    color = RISK_COLORS[result["risk_level"]]
    st.markdown(
        f"<h1 style='color:{color};margin-bottom:0'>{prob:.1%}</h1>"
        f"<p style='color:{color};font-size:1.3rem;margin-top:0'>"
        f"{result['risk_level'].upper()} RISK &middot; "
        f"{'WILL churn' if result['will_churn'] else 'will NOT churn'}</p>",
        unsafe_allow_html=True,
    )
    st.progress(prob)
    st.caption("Risk bands: low < 40% · medium 40–70% · high ≥ 70%")

    st.subheader("What drives the model")
    imp = feature_importance(pipeline)
    imp_df = pd.DataFrame({"feature": list(imp), "importance": list(imp.values())})
    st.bar_chart(imp_df.set_index("feature"), horizontal=True)

st.divider()
st.caption("Built for the Headstarter AI Fellowship · Scikit-learn · XGBoost · FastAPI · Streamlit")
