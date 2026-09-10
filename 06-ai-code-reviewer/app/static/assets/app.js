"use strict";

const $ = (id) => document.getElementById(id);
const API = ""; // same origin

const els = {
  language: $("language"),
  isDiff: $("isDiff"),
  context: $("context"),
  focusChips: $("focusChips"),
  code: $("code"),
  sampleBtn: $("sampleBtn"),
  reviewBtn: $("reviewBtn"),
  providerPill: $("providerPill"),
  themeToggle: $("themeToggle"),
  emptyState: $("emptyState"),
  result: $("result"),
  loading: $("loading"),
  loadingText: $("loadingText"),
  verdictBadge: $("verdictBadge"),
  langTag: $("langTag"),
  scoreArc: $("scoreArc"),
  scoreNum: $("scoreNum"),
  summary: $("summary"),
  truncNotice: $("truncNotice"),
  issues: $("issues"),
  issuesCount: $("issuesCount"),
  noIssues: $("noIssues"),
  improvements: $("improvements"),
  improvementsSection: $("improvementsSection"),
  refactorSection: $("refactorSection"),
  refactoredCode: $("refactoredCode"),
  copyRefactor: $("copyRefactor"),
  toasts: $("toasts"),
};

/* ---------- theme ---------- */
const THEME_KEY = "coderev-theme";
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  els.themeToggle.textContent = t === "dark" ? "☀" : "☾";
  try { localStorage.setItem(THEME_KEY, t); } catch {}
}
(function initTheme() {
  let t = "dark";
  try { t = localStorage.getItem(THEME_KEY) || t; } catch {}
  applyTheme(t);
})();
els.themeToggle.addEventListener("click", () => {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});

/* ---------- toasts ---------- */
function toast(msg, isErr = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " toast--err" : "");
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

/* ---------- focus chips ---------- */
const focus = new Set();
els.focusChips.addEventListener("click", (e) => {
  const btn = e.target.closest(".chip");
  if (!btn) return;
  const key = btn.dataset.focus;
  if (focus.has(key)) { focus.delete(key); btn.classList.remove("is-on"); }
  else { focus.add(key); btn.classList.add("is-on"); }
});

/* ---------- health ---------- */
(async function loadHealth() {
  try {
    const r = await fetch(`${API}/health`);
    const h = await r.json();
    els.providerPill.textContent = h.fake_ai ? "offline mode" : "AI review";
    els.providerPill.title = h.fake_ai
      ? "No API key set — using the offline pattern-based reviewer"
      : `Powered by ${h.provider} (${h.model})`;
  } catch {
    els.providerPill.textContent = "offline";
  }
})();

/* ---------- sample ---------- */
const SAMPLE = `import os

def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    db = connect(password="hunter2")
    try:
        rows = db.execute(query)
    except:
        return None
    result = eval(rows[0]["config"])
    print("loaded user", user_id)
    return result
`;
els.sampleBtn.addEventListener("click", () => {
  els.code.value = SAMPLE;
  els.language.value = "python";
  els.isDiff.checked = false;
  els.context.value = "user lookup helper in a web backend";
});

/* ---------- review ---------- */
let busy = false;
els.reviewBtn.addEventListener("click", runReview);
els.code.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runReview();
});

async function runReview() {
  if (busy) return;
  const code = els.code.value.trim();
  if (!code) { toast("Paste some code first.", true); return; }

  busy = true;
  els.reviewBtn.disabled = true;
  els.reviewBtn.textContent = "Reviewing…";
  els.emptyState.hidden = true;
  els.result.hidden = true;
  els.loading.hidden = false;
  els.loadingText.textContent = "Analysing your code…";

  const choseAuto = els.language.value === "auto";
  const body = {
    language: els.language.value,
    context: els.context.value.trim(),
    focus: [...focus],
  };
  if (els.isDiff.checked) body.diff = code;
  else body.code = code;

  try {
    const r = await fetch(`${API}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
    render(data, choseAuto);
  } catch (err) {
    els.emptyState.hidden = false;
    toast(err.message || "Review failed.", true);
  } finally {
    els.loading.hidden = true;
    busy = false;
    els.reviewBtn.disabled = false;
    els.reviewBtn.textContent = "Review code";
  }
}

/* ---------- render ---------- */
const VERDICT_LABEL = {
  approve: "Approve",
  comment: "Comment",
  request_changes: "Request changes",
};

function render(data, choseAuto) {
  els.result.hidden = false;

  els.verdictBadge.textContent = VERDICT_LABEL[data.verdict] || data.verdict;
  els.verdictBadge.className = "badge badge--verdict badge--" + data.verdict;

  const lang = data.language && data.language !== "unknown" ? data.language : null;
  if (lang) {
    els.langTag.hidden = false;
    els.langTag.textContent = choseAuto ? `detected: ${lang}` : lang;
  } else {
    els.langTag.hidden = true;
  }

  const score = Number(data.score) || 0;
  els.scoreNum.textContent = score.toFixed(1);
  els.scoreArc.style.strokeDashoffset = String(100 - score * 10);
  els.scoreArc.style.stroke =
    score >= 8 ? "var(--ok)" : score >= 5 ? "var(--warn)" : "var(--err)";

  els.summary.textContent = data.summary || "";
  els.truncNotice.hidden = !data.truncated;

  els.issues.innerHTML = "";
  const issues = data.issues || [];
  els.issuesCount.textContent = String(issues.length);
  els.noIssues.hidden = issues.length > 0;
  for (const it of issues) els.issues.appendChild(issueEl(it));

  els.improvements.innerHTML = "";
  const imps = data.improvements || [];
  els.improvementsSection.hidden = imps.length === 0;
  for (const s of imps) {
    const li = document.createElement("li");
    li.textContent = s;
    els.improvements.appendChild(li);
  }

  const refactor = (data.refactored_code || "").trim();
  els.refactorSection.hidden = !refactor;
  els.refactoredCode.textContent = refactor;

  els.result.scrollIntoView({ block: "start", behavior: "smooth" });
}

function issueEl(it) {
  const li = document.createElement("li");
  li.className = "issue issue--" + it.severity;

  const head = document.createElement("div");
  head.className = "issue__head";

  const sev = document.createElement("span");
  sev.className = "issue__sev";
  sev.textContent = it.severity;
  head.appendChild(sev);

  const cat = document.createElement("span");
  cat.className = "issue__cat";
  cat.textContent = it.category;
  head.appendChild(cat);

  if (it.line != null) {
    const ln = document.createElement("span");
    ln.className = "issue__line";
    ln.textContent = "line " + it.line;
    head.appendChild(ln);
  }
  li.appendChild(head);

  const title = document.createElement("div");
  title.className = "issue__title";
  title.textContent = it.title;
  li.appendChild(title);

  if (it.detail) {
    const d = document.createElement("p");
    d.className = "issue__detail";
    d.textContent = it.detail;
    li.appendChild(d);
  }
  if (it.suggestion) {
    const f = document.createElement("p");
    f.className = "issue__fix";
    const strong = document.createElement("strong");
    strong.textContent = "Fix: ";
    f.appendChild(strong);
    f.appendChild(document.createTextNode(it.suggestion));
    li.appendChild(f);
  }
  return li;
}

els.copyRefactor.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.refactoredCode.textContent);
    toast("Refactored code copied.");
  } catch {
    toast("Could not copy.", true);
  }
});
