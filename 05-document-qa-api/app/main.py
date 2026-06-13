import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.chains import RetrievalQA
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader
import tempfile
import uuid

app = FastAPI(title="Document Q&A API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

embeddings = OpenAIEmbeddings(openai_api_key=os.environ["OPENAI_API_KEY"])
llm = ChatOpenAI(model="gpt-4o-mini", openai_api_key=os.environ["OPENAI_API_KEY"])
splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)

doc_stores: dict = {}


class QuestionRequest(BaseModel):
    doc_id: str
    question: str


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    loader = PyPDFLoader(tmp_path)
    docs = loader.load()
    chunks = splitter.split_documents(docs)

    doc_id = str(uuid.uuid4())
    vectorstore = Chroma.from_documents(chunks, embeddings, collection_name=doc_id)
    doc_stores[doc_id] = vectorstore

    os.unlink(tmp_path)
    return {"doc_id": doc_id, "chunks": len(chunks), "pages": len(docs)}


@app.post("/ask")
async def ask_question(req: QuestionRequest):
    if req.doc_id not in doc_stores:
        raise HTTPException(status_code=404, detail="Document not found")

    qa = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=doc_stores[req.doc_id].as_retriever(search_kwargs={"k": 4}),
        return_source_documents=True,
    )
    result = qa({"query": req.question})
    return {
        "answer": result["result"],
        "sources": [{"page": d.metadata.get("page"), "content": d.page_content[:200]}
                    for d in result["source_documents"]],
    }


@app.get("/health")
def health():
    return {"status": "ok"}
