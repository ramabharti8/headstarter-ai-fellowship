"use strict";

const $ = (id) => document.getElementById(id);
const LABELS = ["negative", "neutral", "positive"];

const state = { mode: "single" };

/* ---------- theme ---------- */
const savedTheme = localStorage.getItem("sent-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("sent-theme", next);
});

/* ---------- tabs ---------- */
function setMode(mode) {
  state.mode = mode;
  $("tabSingle").classList.toggle("is-active", mode === "single");
  $("tabBatch").classList.toggle("is-active", mode === "batch");
  $("singlePane").hidden = mode !== "single";
  $("batchPane").hidden = mode !== "batch";
}
$("tabSingle").addEventListener("click", () => setMode("single"));
$("tabBatch").addEventListener("click", () => setMode("batch"));

/* ---------- health / model pill ---------- */
fetch("/health")
  .then((r) => r.json())
  .then((h) => {
    const pill = $("modelPill");
    const model = h.backend === "fake" ? "offline lexicon" : h.model;
    pill.textContent = `${model} · ${h.device}`;
    pill.title = `backend=${h.backend} model=${h.model} device=${h.device}`;
    if (h.backend === "fake") pill.classList.add("pill--fake");
  })
  .catch(() => ($("modelPill").textContent = "offline"));

/* ---------- samples ---------- */
const SINGLE_SAMPLE = "Just tried @acme's new update and honestly it's the best release in years https://acme.co/blog — huge improvement!";
const BATCH_SAMPLE = [
  "I love the new dashboard, so much faster now",
  "Support took 5 days to reply and still didn't fix it. Awful.",
  "The webinar is scheduled for Tuesday at 3pm",
  "not bad, could be better tbh",
].join("\n");
$("sampleBtn").addEventListener("click", () => {
  if (state.mode === "single") $("text").value = SINGLE_SAMPLE;
  else $("batch").value = BATCH_SAMPLE;
});

/* ---------- toast ---------- */
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------- rendering ---------- */
function showOnly(id) {
  for (const k of ["emptyState", "result", "batchResult", "loading"]) $(k).hidden = k !== id;
}

function pct(x) {
  return `${(x * 100).toFixed(1)}%`;
}

function renderSingle(data) {
  showOnly("result");
  const badge = $("sentimentBadge");
  badge.textContent = data.sentiment;
  badge.className = `badge badge--${data.sentiment}`;

  const conf = data.confidence;
  $("gaugeNum").textContent = Math.round(conf * 100);
  $("gaugeArc").style.strokeDashoffset = String(100 - conf * 100);
  const col = getComputedStyle(document.documentElement).getPropertyValue(
    data.sentiment === "positive" ? "--pos" : data.sentiment === "negative" ? "--neg" : "--neu"
  );
  $("gaugeArc").style.stroke = col.trim();

  const bits = [`${data.processing_time_ms} ms`];
  if (data.cached) bits.push("cached");
  $("resultMeta").textContent = bits.join(" · ");
  $("truncNotice").hidden = !data.truncated;

  const bars = $("bars");
  bars.innerHTML = "";
  const entries = LABELS.map((l) => [l, data.scores[l] ?? 0]).sort((a, b) => b[1] - a[1]);
  for (const [label, val] of entries) {
    const row = document.createElement("div");
    row.className = "bar" + (label === data.sentiment ? " is-top" : "");
    row.innerHTML = `
      <span class="bar__label">${label}</span>
      <span class="bar__track"><span class="bar__fill bar__fill--${label}" style="width:${pct(val)}"></span></span>
      <span class="bar__val">${pct(val)}</span>`;
    bars.appendChild(row);
  }
}

function renderBatch(data) {
  showOnly("batchResult");
  $("batchCount").textContent = data.count;
  const m = [`${data.processing_time_ms} ms`];
  if (data.cached_count) m.push(`${data.cached_count} cached`);
  $("batchMeta").textContent = m.join(" · ");
  const list = $("batchList");
  list.innerHTML = "";
  for (const r of data.results) {
    const li = document.createElement("li");
    li.className = "batch-item";
    li.innerHTML = `
      <span class="batch-item__dot batch-item__dot--${r.sentiment}"></span>
      <span class="batch-item__text">${escapeHtml(r.text)}</span>
      <span class="batch-item__tag">${r.sentiment} ${(r.confidence * 100).toFixed(0)}%</span>`;
    list.appendChild(li);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- submit ---------- */
async function analyze() {
  const preprocess = $("preprocess").checked;
  const btn = $("analyzeBtn");
  btn.disabled = true;
  showOnly("loading");

  try {
    let res, body;
    if (state.mode === "single") {
      const text = $("text").value.trim();
      if (!text) throw new Error("Enter some text first.");
      res = await fetch("/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, preprocess }),
      });
      body = await res.json();
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      renderSingle(body);
    } else {
      const texts = $("batch").value.split("\n").map((s) => s.trim()).filter(Boolean);
      if (!texts.length) throw new Error("Enter at least one line.");
      res = await fetch("/analyze/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, preprocess }),
      });
      body = await res.json();
      if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
      renderBatch(body);
    }
  } catch (err) {
    showOnly("emptyState");
    toast(err.message || "Something went wrong.");
  } finally {
    btn.disabled = false;
  }
}
$("analyzeBtn").addEventListener("click", analyze);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") analyze();
});
