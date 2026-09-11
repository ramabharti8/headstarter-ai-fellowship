"use strict";

const $ = (id) => document.getElementById(id);
let resumeFile = null;

/* ---------- theme ---------- */
const savedTheme = localStorage.getItem("resume-theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("resume-theme", next);
});

/* ---------- health / provider pill ---------- */
fetch("/health")
  .then((r) => r.json())
  .then((h) => {
    const pill = $("providerPill");
    pill.textContent = h.fake_ai ? "offline heuristic" : `${h.provider} · ${h.model}`;
    pill.title = `provider=${h.provider} model=${h.model}`;
    if (h.fake_ai) pill.classList.add("pill--fake");
  })
  .catch(() => ($("providerPill").textContent = "offline"));

/* ---------- resume file picker / drag-drop ---------- */
const dropzone = $("dropzone");
const fileInput = $("resumeFile");

function setFile(file) {
  resumeFile = file || null;
  const label = $("dropzoneText");
  if (resumeFile) {
    label.textContent = `${resumeFile.name} (${(resumeFile.size / 1024).toFixed(0)} KB)`;
    dropzone.classList.add("has-file");
  } else {
    label.textContent = "Click to choose a file, or drag one here";
    dropzone.classList.remove("has-file");
  }
}
fileInput.addEventListener("change", () => setFile(fileInput.files[0]));

["dragover", "dragenter"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-drag");
  })
);
["dragleave", "dragend"].forEach((ev) =>
  dropzone.addEventListener(ev, () => dropzone.classList.remove("is-drag"))
);
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("is-drag");
  const file = e.dataTransfer.files[0];
  if (file) {
    fileInput.files = e.dataTransfer.files;
    setFile(file);
  }
});

/* ---------- sample ---------- */
const SAMPLE_JD = `Backend Engineer (Python)

We're looking for a Backend Engineer with 3+ years of experience to help scale our API platform.

Requirements:
- Strong Python and FastAPI (or Django/Flask) experience
- Experience with PostgreSQL and Redis
- Familiarity with Docker and AWS
- Comfortable with REST API design and testing
- Bonus: Kubernetes, CI/CD, GraphQL`;

const SAMPLE_RESUME = `Jordan Lee — Software Engineer
5 years of experience building backend services in Python.
Built and shipped REST APIs with FastAPI and Flask, deployed on AWS with Docker.
Worked extensively with PostgreSQL for primary storage and Redis for caching.
Wrote unit tests and set up CI/CD pipelines with GitHub Actions.
No prior Kubernetes experience.`;

$("sampleBtn").addEventListener("click", async () => {
  $("jd").value = SAMPLE_JD;
  const blob = new Blob([SAMPLE_RESUME], { type: "text/plain" });
  const file = new File([blob], "sample_resume.txt", { type: "text/plain" });
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  setFile(file);
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
  for (const k of ["emptyState", "result", "loading"]) $(k).hidden = k !== id;
}

function renderChips(container, items, emptyText) {
  container.innerHTML = "";
  if (!items.length) {
    const span = document.createElement("span");
    span.className = "chips__empty";
    span.textContent = emptyText;
    container.appendChild(span);
    return;
  }
  for (const item of items) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    container.appendChild(chip);
  }
}

function renderList(container, items, emptyText) {
  container.innerHTML = "";
  const rows = items.length ? items : [emptyText];
  for (const item of rows) {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  }
}

function renderResult(data) {
  showOnly("result");

  const badge = $("recBadge");
  badge.textContent = data.recommendation;
  badge.className = `badge badge--rec rec-${data.recommendation}`;
  $("gradeTag").textContent = `Grade ${data.grade}`;

  $("scoreNum").textContent = data.score;
  $("scoreArc").style.strokeDashoffset = String(100 - data.score);
  const color =
    data.score >= 70 ? "--good" : data.score >= 45 ? "--warn" : "--bad";
  $("scoreArc").style.stroke = getComputedStyle(document.documentElement)
    .getPropertyValue(color)
    .trim();

  $("summary").textContent = data.summary;

  const notices = [];
  if (data.resume_truncated) notices.push("Resume was truncated before scoring.");
  if (data.jd_truncated) notices.push("Job description was truncated before scoring.");
  $("truncNotice").hidden = notices.length === 0;
  $("truncNotice").textContent = notices.join(" ");

  $("matchedCount").textContent = data.key_skills_matched.length;
  $("missingCount").textContent = data.key_skills_missing.length;
  renderChips($("matchedChips"), data.key_skills_matched, "No matched skills found.");
  renderChips($("missingChips"), data.key_skills_missing, "No missing skills found.");

  renderList($("strengths"), data.strengths, "No strengths listed.");
  renderList($("gaps"), data.gaps, "No gaps listed.");
}

/* ---------- submit ---------- */
async function screenResume() {
  const jd = $("jd").value.trim();
  if (!resumeFile) return toast("Choose a resume file first.");
  if (!jd) return toast("Paste a job description first.");

  const btn = $("screenBtn");
  btn.disabled = true;
  showOnly("loading");

  try {
    const form = new FormData();
    form.append("resume", resumeFile);
    form.append("job_description", jd);

    const res = await fetch("/screen", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || `HTTP ${res.status}`);
    renderResult(body);
  } catch (err) {
    showOnly("emptyState");
    toast(err.message || "Something went wrong.");
  } finally {
    btn.disabled = false;
  }
}
$("screenBtn").addEventListener("click", screenResume);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") screenResume();
});
