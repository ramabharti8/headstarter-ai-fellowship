# Headstarter AI Fellowship — 14 Production Projects

> 14 AI/ML systems shipped in 7 weeks during the Headstarter AI Fellowship (Remote · New York, USA · Jul–Sep 2024). Top cohort ranking.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![TensorFlow](https://img.shields.io/badge/TensorFlow-2.x-orange)](https://tensorflow.org)
[![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4-green)](https://openai.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-green)](https://fastapi.tiangolo.com)
[![Node.js](https://img.shields.io/badge/Node.js-18-brightgreen)](https://nodejs.org)

---

## Fellowship Overview

**Program:** Headstarter AI Fellowship — Competitive 7-week AI engineering sprint  
**Location:** Remote · New York, USA  
**Result:** Top cohort · 14 production projects in 7 weeks · 10+ AI APIs shipped

---

## Projects Shipped

### AI / ML Models

| # | Project | Tech | What It Does |
|---|---------|------|--------------|
| 01 | **[MRI Brain Tumor Classifier](01-mri-brain-tumor-classifier)** | TensorFlow · Keras · VGG-16 · FastAPI | VGG-16 transfer-learning CNN classifies brain MRI scans into glioma / meningioma / pituitary / no-tumor, served via a REST API |
| 02 | **[Customer Churn Predictor](02-customer-churn-predictor)** | XGBoost · FastAPI · MLflow · Streamlit | Calibrated XGBoost on the real IBM Telco dataset (ROC-AUC 0.84); FastAPI API with API-key auth, PSI/KS drift detection & MLflow tracking |
| 03 | **[Financial Automation Pipeline](03-financial-automation-pipeline)** | Pandas · scikit-learn · FastAPI | Automated financial reports + anomaly detection; a multivariate Isolation Forest catches 82% of real fraud (ROC-AUC 0.95) on the ULB Credit Card Fraud dataset |

### AI-Powered Applications

| # | Project | Tech | What It Does |
|---|---------|------|--------------|
| 04 | **[AI Customer Support Bot](04-ai-customer-support-bot)** | Next.js 15 · Prisma · pgvector · Auth.js · Gemini | Multi-tenant AI assistant platform: streaming chat with memory, a RAG knowledge base over pgvector with citations, an embeddable widget, and a bearer-authed REST API — Dockerised with unit + e2e tests and CI |
| 05 | **[Document Q&A API](05-document-qa-api)** | LangChain · FAISS · FastAPI · Groq / Gemini | Upload a PDF, ask questions in natural language, get answers with page citations. RAG over a per-document FAISS index with a pluggable LLM (OpenAI / Groq / Gemini / offline), a whole-document map-reduce summarizer, and a chat-style web UI — per-IP rate limiting, optional API-key gate, Dockerised with offline tests and CI |
| 06 | **[AI Code Reviewer](06-ai-code-reviewer)** | OpenAI GPT-4o / Groq · FastAPI | Submit a code snippet or a unified diff, get a structured review: summary, PR-style verdict, severity-ranked issues with line numbers, improvement ideas, a refactored version and a 0–10 score. Pluggable provider (OpenAI / Groq / offline heuristic), JSON-mode structured output, per-IP rate limiting, optional API-key gate, a web UI — Dockerised with offline tests and CI |
| 07 | **[Sentiment Analysis API](07-sentiment-analysis-api)** | Hugging Face · RoBERTa · FastAPI | Score text or a batch as negative / neutral / positive with the full probability distribution. Twitter-aware preprocessing, honest truncation detection, an LRU result cache, a pluggable offline lexicon backend for zero-dependency CI, Prometheus `/metrics`, per-IP rate limiting, optional API-key gate, a web UI — Dockerised (model baked in) with offline tests and CI |
| 08 | **[AI Resume Screener](08-ai-resume-screener)** | OpenAI GPT-4o / Groq · FastAPI | Upload a resume (PDF/DOCX/text) and a job description, get a 0–100 score, letter grade, matched/missing skills, concrete strengths/gaps and a hire/maybe/reject call. Pluggable provider with an offline skill-overlap heuristic (~140-term taxonomy + experience-years check), per-IP rate limiting, optional API-key gate, a drag-and-drop web UI — Dockerised with offline tests and CI |
| 09 | **[Smart Search API](09-smart-search-api)** | FAISS · SQLite · FastAPI | Index documents and search them by meaning — a query with zero keyword overlap still finds the right document, ranked by real cosine similarity. Persistent FAISS + SQLite store (real delete, survives restarts), pluggable embeddings with a zero-API-key local default (fastembed), per-IP rate limiting, optional API-key gate, a web UI — Dockerised with offline tests and CI |
| 10 | **[AI Email Drafting Tool](10-ai-email-drafting-tool)** | OpenAI GPT-4o-mini / Groq · FastAPI | Turn bullet points into a polished, tone-matched email — 6 tones, 3 lengths, up to 3 variants per request, plus a `/revise` endpoint to iterate with plain-English feedback. Pluggable provider with a real offline template drafter (not a stub), per-IP rate limiting, optional API-key gate, a web UI — Dockerised with offline tests and CI |

### Real-Time Applications

| # | Project | Tech | What It Does |
|---|---------|------|--------------|
| 11 | **[Real-Time Chat App](11-realtime-chat-app)** | React · Node.js · Socket.IO · MongoDB | Persistent public rooms and 1:1 direct messages with JWT auth, live presence, typing indicators, read receipts, and file/image sharing — Dockerised for deployment |
| 12 | **[Video Conferencing App](12-video-conferencing-app)** | React · WebRTC · Node.js · Socket.IO · MongoDB | Multi-party peer-to-peer video calls (WebRTC mesh) with JWT auth, password-protected rooms, screen sharing, live chat & reactions, and in-call recording — Dockerised for deployment |
| 13 | **[Live Collaboration Tool](13-live-collaboration-tool)** | React · Yjs (CRDT) · Node.js · Socket.IO · MongoDB | Real-time collaborative documents with true CRDT merge (Yjs) and a shared whiteboard, with JWT auth, live presence/cursors, version history with restore, and durable MongoDB persistence — Dockerised for deployment |
| 14 | **[Real-Time Notification System](14-realtime-notification-system)** | React · Node.js · Socket.IO · Redis · MongoDB | Real-time notification delivery with JWT auth, topic subscriptions, a bell + inbox notification center with live popups, in-app + email channels, and Redis-backed delivery tracking — Dockerised for deployment |

---

## Skills Demonstrated

- **ML Pipelines** — data preprocessing, model training, evaluation, deployment
- **REST API Design** — 10+ production-grade FastAPI / Node.js APIs
- **Real-Time Systems** — WebSocket, WebRTC, Socket.IO
- **AI Integration** — OpenAI, LangChain, Hugging Face, ChromaDB
- **Rapid Shipping** — 2 projects/week while maintaining production quality

---

## Tech Stack Summary

```
AI/ML        : TensorFlow · Keras · Scikit-learn · XGBoost · OpenAI · LangChain · Hugging Face
Backend      : FastAPI · Node.js · Express.js
Real-Time    : WebSocket · Socket.IO · WebRTC
Databases    : PostgreSQL · MongoDB · Firebase · ChromaDB
Frontend     : React · Tailwind CSS
Deployment   : Docker · GCP · Railway · Vercel
```

---

## Contact

- **Email**: ramabharti.career@gmail.com
- **LinkedIn**: [linkedin.com/in/ramabharti](https://linkedin.com/in/ramabharti)

---

*Built by [Rama Bharti](https://github.com/ramabharti8) · Headstarter AI Fellowship · Top Cohort*

