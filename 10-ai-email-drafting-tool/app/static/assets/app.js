"use strict";

const $ = (id) => document.getElementById(id);
let drafts = [];
let activeVariant = 0;

/* ---------- theme ---------- */
const savedTheme = localStorage.getItem("email-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("email-theme", next);
});

/* ---------- status pill (no provider/model exposed) ---------- */
fetch("/health")
  .then((r) => r.json())
  .then((h) => {
    const pill = $("statusPill");
    pill.textContent = h.fake_ai ? "Offline mode" : "AI-powered";
    if (h.fake_ai) pill.classList.add("pill--fake");
  })
  .catch(() => ($("statusPill").textContent = "offline"));

/* ---------- bullet rows ---------- */
function addBulletRow(value = "") {
  const row = document.createElement("div");
  row.className = "bullet-row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = "A key point…";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "bullet-row__del";
  del.textContent = "✕";
  del.addEventListener("click", () => {
    row.remove();
    if (!$("bullets").children.length) addBulletRow();
  });
  row.appendChild(input);
  row.appendChild(del);
  $("bullets").appendChild(row);
  return input;
}
$("addBullet").addEventListener("click", () => addBulletRow());
addBulletRow();
addBulletRow();

function getBullets() {
  return [...$("bullets").querySelectorAll("input")]
    .map((i) => i.value.trim())
    .filter(Boolean);
}

/* ---------- sample ---------- */
$("sampleBtn").addEventListener("click", () => {
  $("bullets").innerHTML = "";
  ["Meeting rescheduled to Thursday 3pm", "New agenda includes budget review", "Please confirm attendance"].forEach(
    addBulletRow
  );
  $("recipient").value = "Team";
  $("sender").value = "Rama";
  $("tone").value = "professional";
  $("length").value = "medium";
  $("context").value = "";
});

/* ---------- toast ---------- */
function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " toast--error" : "");
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------- rendering ---------- */
function showOnly(id) {
  for (const k of ["emptyState", "result", "loading"]) $(k).hidden = k !== id;
}

function renderVariantTabs() {
  const wrap = $("variantTabs");
  wrap.innerHTML = "";
  if (drafts.length <= 1) return;
  drafts.forEach((_, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "variant-tab" + (i === activeVariant ? " is-active" : "");
    btn.textContent = `Variant ${i + 1}`;
    btn.addEventListener("click", () => {
      activeVariant = i;
      renderActiveDraft();
      renderVariantTabs();
    });
    wrap.appendChild(btn);
  });
}

function renderActiveDraft() {
  const d = drafts[activeVariant];
  $("subjectBox").textContent = d.subject;
  $("bodyBox").textContent = d.body;
}

function renderDraftResponse(data) {
  drafts = data.drafts;
  activeVariant = 0;
  showOnly("result");
  renderVariantTabs();
  renderActiveDraft();
  $("truncNotice").hidden = !data.truncated;
}

/* ---------- draft ---------- */
async function draftEmail() {
  const bullets = getBullets();
  if (!bullets.length) return toast("Add at least one key point.");

  const btn = $("draftBtn");
  btn.disabled = true;
  showOnly("loading");
  $("loadingText").textContent = "Drafting…";

  try {
    const res = await fetch("/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bullet_points: bullets,
        recipient: $("recipient").value.trim(),
        sender: $("sender").value.trim(),
        tone: $("tone").value,
        length: $("length").value,
        context: $("context").value.trim(),
        variants: Number($("variants").value),
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    renderDraftResponse(body);
  } catch (err) {
    showOnly("emptyState");
    toast(err.message || "Something went wrong.", true);
  } finally {
    btn.disabled = false;
  }
}
$("draftBtn").addEventListener("click", draftEmail);

/* ---------- revise ---------- */
async function reviseEmail() {
  const feedback = $("feedback").value.trim();
  if (!feedback) return toast("Describe what to change first.");
  if (!drafts.length) return toast("Draft an email first.");

  const btn = $("reviseBtn");
  btn.disabled = true;
  const prevText = $("loadingText").textContent;
  showOnly("loading");
  $("loadingText").textContent = "Revising…";

  try {
    const res = await fetch("/revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_email: drafts[activeVariant].full_email,
        feedback,
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    drafts[activeVariant] = body;
    showOnly("result");
    renderActiveDraft();
    $("feedback").value = "";
    toast("Revised.");
  } catch (err) {
    showOnly("result");
    toast(err.message || "Something went wrong.", true);
  } finally {
    btn.disabled = false;
    $("loadingText").textContent = prevText;
  }
}
$("reviseBtn").addEventListener("click", reviseEmail);

/* ---------- copy ---------- */
$("copyBtn").addEventListener("click", async () => {
  if (!drafts.length) return;
  try {
    await navigator.clipboard.writeText(drafts[activeVariant].full_email);
    toast("Copied to clipboard.");
  } catch {
    toast("Could not copy — select and copy manually.", true);
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") draftEmail();
});
