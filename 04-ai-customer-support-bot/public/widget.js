(function () {
  var script = document.currentScript;
  var orgId = script && script.getAttribute("data-org");
  if (!orgId) {
    console.error("[HelpdeskAI] widget.js: missing data-org attribute");
    return;
  }
  var origin = new URL(script.src).origin;

  var btn = document.createElement("button");
  btn.setAttribute("aria-label", "Open support chat");
  btn.style.cssText =
    "position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:9999px;border:none;" +
    "background:#2563eb;color:#fff;font-size:24px;cursor:pointer;z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,.2)";
  btn.textContent = "💬";

  var frame = document.createElement("iframe");
  frame.src = origin + "/widget/" + encodeURIComponent(orgId);
  frame.title = "Support chat";
  frame.style.cssText =
    "position:fixed;bottom:88px;right:20px;width:380px;height:560px;max-width:calc(100vw - 40px);" +
    "max-height:calc(100vh - 120px);border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;" +
    "background:#fff;z-index:2147483647;box-shadow:0 12px 32px rgba(0,0,0,.24);display:none";

  var open = false;
  btn.addEventListener("click", function () {
    open = !open;
    frame.style.display = open ? "block" : "none";
    btn.textContent = open ? "✕" : "💬";
  });

  document.body.appendChild(frame);
  document.body.appendChild(btn);
})();
