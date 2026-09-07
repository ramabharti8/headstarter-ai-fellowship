"use strict";

/* ------------------------------------------------------------------ helpers */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

async function api(path, opts) {
  const res = await fetch(path, opts);
  let body = null;
  try { body = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new Error((body && body.detail) || `${res.status} ${res.statusText}`);
  return body;
}

function toast(msg, isError = false) {
  const t = el("div", "toast" + (isError ? " toast--err" : ""), msg);
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

function renderMarkdown(text) {
  const raw = window.marked ? window.marked.parse(text, { gfm: true, breaks: true }) : text;
  return window.DOMPurify ? window.DOMPurify.sanitize(raw) : raw;
}

const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ------------------------------------------------------------------ state */
const state = {
  provider: null,
  docs: [],
  activeId: store.get("qa:active", null),
  busy: false,
};
const threadKey = (id) => `qa:thread:${id}`;
const getThread = (id) => store.get(threadKey(id), []);
const setThread = (id, msgs) => store.set(threadKey(id), msgs);

/* ------------------------------------------------------------------ theme */
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  store.set("qa:theme", t);
}
applyTheme(store.get("qa:theme", "dark"));
$("#themeToggle").addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

/* ------------------------------------------------------------------ health */
async function loadHealth() {
  const badge = $("#providerBadge");
  try {
    const h = await api("/health");
    state.provider = h;
    if (h.fake_ai) {
      badge.className = "badge is-demo";
      badge.innerHTML = '<span class="dot"></span>demo mode';
    } else {
      badge.className = "badge is-live";
      badge.innerHTML = `<span class="dot"></span>${h.provider}`;
    }
  } catch {
    badge.className = "badge is-off";
    badge.innerHTML = '<span class="dot"></span>offline';
  }
}

/* ------------------------------------------------------------------ documents */
async function loadDocs() {
  try {
    const { documents } = await api("/documents");
    state.docs = documents;
  } catch (e) {
    toast("Could not load documents: " + e.message, true);
    state.docs = [];
  }
  if (!state.docs.some((d) => d.doc_id === state.activeId)) {
    state.activeId = state.docs[0] ? state.docs[0].doc_id : null;
  }
  store.set("qa:active", state.activeId);
  renderDocs();
  renderActive();
}

function renderDocs() {
  const list = $("#docList");
  list.querySelectorAll(".doc").forEach((n) => n.remove());
  $("#docListEmpty").hidden = state.docs.length > 0;

  for (const d of state.docs) {
    const item = el("div", "doc" + (d.doc_id === state.activeId ? " is-active" : ""));
    item.setAttribute("role", "listitem");
    item.innerHTML = `
      <svg class="doc__icon" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 2h6l4 4v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M12 2v4h4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
      <span class="doc__body">
        <span class="doc__name"></span>
        <span class="doc__meta">${d.pages} pages · ${d.chunks} chunks</span>
      </span>
      <button class="doc__del" title="Delete" aria-label="Delete document">✕</button>`;
    $(".doc__name", item).textContent = d.filename;
    item.addEventListener("click", (ev) => {
      if (ev.target.closest(".doc__del")) return;
      selectDoc(d.doc_id);
      closeSidebar();
    });
    $(".doc__del", item).addEventListener("click", () => deleteDoc(d));
    list.appendChild(item);
  }
}

function selectDoc(id) {
  state.activeId = id;
  store.set("qa:active", id);
  renderDocs();
  renderActive();
}

async function deleteDoc(d) {
  if (!confirm(`Delete "${d.filename}"? This removes its index and chat history.`)) return;
  try {
    await api(`/documents/${d.doc_id}`, { method: "DELETE" });
    store.del(threadKey(d.doc_id));
    toast(`Deleted "${d.filename}"`);
    await loadDocs();
  } catch (e) {
    toast("Delete failed: " + e.message, true);
  }
}

/* ------------------------------------------------------------------ upload */
async function uploadFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name)) return toast("Only PDF files are supported.", true);

  const btn = $("#uploadBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Indexing…";
  try {
    const fd = new FormData();
    fd.append("file", file);
    const doc = await api("/upload", { method: "POST", body: fd });
    toast(`Indexed "${doc.filename}" — ${doc.pages} pages`);
    state.activeId = doc.doc_id;
    store.set("qa:active", doc.doc_id);
    await loadDocs();
    closeSidebar();
  } catch (e) {
    toast("Upload failed: " + e.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

$("#uploadBtn").addEventListener("click", () => $("#fileInput").click());
$("#fileInput").addEventListener("change", (e) => uploadFile(e.target.files[0]));

const dz = $("#dropzone");
["dragenter", "dragover"].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("is-drag"); }));
["dragleave", "drop"].forEach((ev) =>
  dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("is-drag"); }));
dz.addEventListener("drop", (e) => uploadFile(e.dataTransfer.files[0]));

/* ------------------------------------------------------------------ thread render */
function renderActive() {
  const doc = state.docs.find((d) => d.doc_id === state.activeId);
  $("#activeDocName").textContent = doc ? doc.filename : "No document selected";
  $("#activeDocMeta").textContent = doc ? `${doc.pages} pages · ${doc.chunks} chunks · id ${doc.doc_id.slice(0, 8)}` : "";
  $("#summarizeBtn").disabled = !doc || state.busy;
  $("#input").disabled = !doc || state.busy;
  $("#sendBtn").disabled = !doc || state.busy || !$("#input").value.trim();

  const thread = $("#thread");
  thread.querySelector(".thread__inner")?.remove();

  if (!doc) { $("#emptyState").hidden = false; $("#suggests").hidden = true; return; }

  const msgs = getThread(doc.doc_id);
  if (msgs.length === 0) {
    $("#emptyState").hidden = false;
    $("#suggests").hidden = false;
    return;
  }
  $("#emptyState").hidden = true;

  const inner = el("div", "thread__inner");
  for (const m of msgs) inner.appendChild(messageNode(m));
  thread.appendChild(inner);
  scrollThread();
}

function messageNode(m) {
  const node = el("div", `msg msg--${m.role === "user" ? "user" : "ai"}`);
  const avatar = el("div", "msg__avatar", m.role === "user" ? "You"[0] : "");
  if (m.role !== "user") {
    avatar.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M10 2l1.7 4.3L16 8l-4.3 1.7L10 14l-1.7-4.3L4 8l4.3-1.7z" fill="#fff"/></svg>';
  }
  const body = el("div", "msg__body");
  body.appendChild(el("div", "msg__role", m.role === "user" ? "You" : "Assistant"));

  if (m.pending) {
    const t = el("div", "typing");
    t.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(t);
  } else if (m.role === "user") {
    body.appendChild(el("div", "msg__text", m.text));
  } else {
    const prose = el("div", "prose");
    prose.innerHTML = renderMarkdown(m.text || "");
    body.appendChild(prose);

    if (m.sources && m.sources.length) {
      const wrap = el("div", "sources");
      const panel = el("div", "source-panel");
      panel.hidden = true;
      m.sources.forEach((s, i) => {
        const chip = el("button", "source-chip", `p.${s.page ?? "?"}`);
        chip.addEventListener("click", () => { panel.hidden = !panel.hidden; });
        wrap.appendChild(chip);
        const row = el("div", "source-panel__item");
        row.innerHTML = `<span class="source-panel__page">Page ${s.page ?? "?"}</span> — `;
        row.appendChild(document.createTextNode(s.snippet));
        panel.appendChild(row);
        if (i === 0) chip.title = "Show / hide source passages";
      });
      body.appendChild(wrap);
      body.appendChild(panel);
    }

    const foot = el("div", "msg__foot");
    if (m.ms) foot.appendChild(el("span", "msg__stat", `${(m.ms / 1000).toFixed(1)}s`));
    if (m.chunks) foot.appendChild(el("span", "msg__stat", `${m.chunks} chunks read`));
    const copy = el("button", "copy-btn", "Copy");
    copy.addEventListener("click", () => {
      navigator.clipboard.writeText(m.text || "").then(() => {
        copy.textContent = "Copied";
        setTimeout(() => (copy.textContent = "Copy"), 1500);
      });
    });
    foot.appendChild(copy);
    body.appendChild(foot);
  }

  node.appendChild(avatar);
  node.appendChild(body);
  return node;
}

function scrollThread() {
  const t = $("#thread");
  t.scrollTop = t.scrollHeight;
}

/* ------------------------------------------------------------------ ask / summarize */
async function ask(question) {
  const id = state.activeId;
  if (!id || !question || state.busy) return;

  const msgs = getThread(id);
  msgs.push({ role: "user", text: question });
  msgs.push({ role: "ai", pending: true });
  setThread(id, msgs);
  setBusy(true);
  renderActive();

  const started = performance.now();
  try {
    const res = await api("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_id: id, question }),
    });
    finishAi(id, {
      text: res.answer,
      sources: res.sources,
      ms: performance.now() - started,
    });
  } catch (e) {
    finishAi(id, { text: `⚠️ ${e.message}` });
  } finally {
    setBusy(false);
  }
}

async function summarize() {
  const id = state.activeId;
  if (!id || state.busy) return;
  const focus = $("#input").value.trim() || null;
  if (focus) $("#input").value = "";
  autosize();

  const msgs = getThread(id);
  msgs.push({ role: "user", text: focus ? `Summarize the document — focus: ${focus}` : "Summarize the whole document" });
  msgs.push({ role: "ai", pending: true });
  setThread(id, msgs);
  setBusy(true);
  renderActive();

  const started = performance.now();
  try {
    const res = await api("/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc_id: id, focus }),
    });
    finishAi(id, {
      text: res.summary,
      chunks: res.chunks_used,
      ms: performance.now() - started,
    });
  } catch (e) {
    finishAi(id, { text: `⚠️ ${e.message}` });
  } finally {
    setBusy(false);
  }
}

function finishAi(id, payload) {
  const msgs = getThread(id);
  const idx = msgs.map((m) => m.pending).lastIndexOf(true);
  if (idx === -1) msgs.push({ role: "ai", ...payload });
  else msgs[idx] = { role: "ai", ...payload };
  setThread(id, msgs);
  renderActive();
}

function setBusy(b) {
  state.busy = b;
  $("#summarizeBtn").disabled = b || !state.activeId;
  $("#input").disabled = b || !state.activeId;
  updateSend();
}

/* ------------------------------------------------------------------ composer */
const input = $("#input");
function autosize() {
  // Only called on real user input, so the container is laid out and visible.
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}
function updateSend() {
  $("#sendBtn").disabled = state.busy || !state.activeId || !input.value.trim();
}
input.addEventListener("input", () => { autosize(); updateSend(); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit();
  }
});
$("#sendBtn").addEventListener("click", submit);
$("#summarizeBtn").addEventListener("click", summarize);

function submit() {
  const q = input.value.trim();
  if (!q) return;
  input.value = "";
  autosize();
  updateSend();
  ask(q);
}

$("#suggests").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) ask(chip.textContent);
});

/* ------------------------------------------------------------------ sidebar (mobile) */
function openSidebar() { $("#sidebar").classList.add("is-open"); $("#scrim").classList.add("is-open"); }
function closeSidebar() { $("#sidebar").classList.remove("is-open"); $("#scrim").classList.remove("is-open"); }
$("#menuBtn").addEventListener("click", openSidebar);
$("#sidebarClose").addEventListener("click", closeSidebar);
$("#scrim").addEventListener("click", closeSidebar);

/* ------------------------------------------------------------------ boot */
(async function boot() {
  await Promise.all([loadHealth(), loadDocs()]);
})();
