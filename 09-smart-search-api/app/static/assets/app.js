"use strict";

const $ = (id) => document.getElementById(id);
let mode = "search";

/* ---------- theme ---------- */
const savedTheme = localStorage.getItem("search-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("search-theme", next);
});

/* ---------- tabs ---------- */
function setMode(next) {
  mode = next;
  $("tabSearch").classList.toggle("is-active", mode === "search");
  $("tabIndex").classList.toggle("is-active", mode === "index");
  $("searchPane").hidden = mode !== "search";
  $("indexPane").hidden = mode !== "index";
}
$("tabSearch").addEventListener("click", () => setMode("search"));
$("tabIndex").addEventListener("click", () => setMode("index"));

/* ---------- status pill (no provider/model exposed) + document browser ---------- */
async function refreshHealth() {
  try {
    const h = await fetch("/health").then((r) => r.json());
    $("statusPill").textContent = "Semantic search ready";
    $("totalCount").textContent = h.total_documents;
    return h;
  } catch {
    $("statusPill").textContent = "offline";
  }
}

async function refreshDocs() {
  try {
    const body = await fetch("/documents?limit=25").then((r) => r.json());
    $("totalCount").textContent = body.total_documents;
    const list = $("docList");
    list.innerHTML = "";
    if (!body.documents.length) {
      list.innerHTML = '<li class="doc-list__empty">No documents indexed yet.</li>';
      return;
    }
    for (const doc of body.documents) {
      const li = document.createElement("li");
      li.className = "doc-item";
      const span = document.createElement("span");
      span.className = "doc-item__text";
      span.textContent = doc.document;
      span.title = doc.document;
      const del = document.createElement("button");
      del.className = "doc-item__del";
      del.type = "button";
      del.textContent = "✕";
      del.title = "Delete";
      del.addEventListener("click", async () => {
        await fetch(`/index/${encodeURIComponent(doc.id)}`, { method: "DELETE" });
        toast("Deleted.");
        refreshDocs();
        refreshHealth();
      });
      li.appendChild(span);
      li.appendChild(del);
      list.appendChild(li);
    }
  } catch {
    /* best-effort */
  }
}
$("refreshBtn").addEventListener("click", () => {
  refreshDocs();
  refreshHealth();
});

/* ---------- toast ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------- sample docs ---------- */
const SAMPLE_DOCS = [
  "FastAPI is a modern, high-performance Python web framework for building APIs.",
  "React is a JavaScript library for building user interfaces, maintained by Meta.",
  "PostgreSQL is a powerful open-source relational database system.",
  "Docker packages an application and its dependencies into a portable container.",
  "Kubernetes orchestrates containerized applications across a cluster of machines.",
  "TensorFlow is an open-source machine learning framework developed by Google.",
  "Redis is an in-memory data store often used for caching and pub/sub.",
  "GraphQL lets clients request exactly the data they need from an API.",
];

async function seedSamples() {
  showOnly("loading", "Indexing sample documents…");
  try {
    const res = await fetch("/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: SAMPLE_DOCS }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    toast(`Indexed ${body.indexed} sample documents.`);
    refreshDocs();
    refreshHealth();
  } catch (err) {
    toast(err.message || "Something went wrong.");
  } finally {
    showOnly("emptyState");
  }
}
$("seedBtn").addEventListener("click", seedSamples);

/* ---------- index ---------- */
async function indexDocuments() {
  const lines = $("docs").value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return toast("Add at least one document.");

  showOnly("loading", "Indexing…");
  try {
    const res = await fetch("/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: lines }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    toast(`Indexed ${body.indexed} document(s).`);
    $("docs").value = "";
    setMode("search");
    refreshDocs();
    refreshHealth();
  } catch (err) {
    toast(err.message || "Something went wrong.");
  } finally {
    showOnly("emptyState");
  }
}
$("indexBtn").addEventListener("click", indexDocuments);

/* ---------- rendering ---------- */
function showOnly(id, loadingText) {
  for (const k of ["emptyState", "results", "loading"]) $(k).hidden = k !== id;
  if (id === "loading" && loadingText) $("loadingText").textContent = loadingText;
}

function renderResults(data) {
  showOnly("results");
  $("resultMeta").textContent =
    `${data.results.length} result(s) of ${data.total_documents} indexed — ` +
    `${data.processing_time_ms} ms`;

  const list = $("resultList");
  list.innerHTML = "";
  if (!data.results.length) {
    list.innerHTML = '<li class="result-list__empty">No matches — index some documents first.</li>';
    return;
  }
  data.results.forEach((r, i) => {
    const pct = Math.max(0, Math.min(100, (r.score + 1) * 50)); // cosine [-1,1] -> %
    const li = document.createElement("li");
    li.className = "result-item";
    li.innerHTML = `
      <div class="result-item__head">
        <span class="result-item__rank">#${i + 1}</span>
        <span class="result-item__score">${r.score.toFixed(3)}</span>
      </div>
      <span class="result-item__bar"><span class="result-item__bar-fill" style="width:${pct}%"></span></span>
      <div class="result-item__text"></div>
      <div class="result-item__id">id: ${r.id}</div>`;
    li.querySelector(".result-item__text").textContent = r.document;
    list.appendChild(li);
  });
}

/* ---------- search ---------- */
async function runSearch() {
  const query = $("query").value.trim();
  if (!query) return toast("Type a query first.");
  const topK = Math.max(1, Math.min(50, Number($("topK").value) || 5));

  showOnly("loading", "Searching…");
  try {
    const res = await fetch("/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: topK }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    renderResults(body);
  } catch (err) {
    showOnly("emptyState");
    toast(err.message || "Something went wrong.");
  }
}
$("searchBtn").addEventListener("click", runSearch);
$("query").addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

/* ---------- boot ---------- */
refreshHealth();
refreshDocs();
