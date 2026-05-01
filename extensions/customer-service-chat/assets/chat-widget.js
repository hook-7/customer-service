(function () {
  var ROOT = "customer-service-chat-loader";
  var SRC = "/apps/cs/widget";
  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>';

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function load(openAfterLoad) {
    if (window.CustomerServiceChat) {
      if (openAfterLoad && window.CustomerServiceChat.open) window.CustomerServiceChat.open();
      return;
    }
    if (document.getElementById("customer-service-chat-runtime")) return;
    var script = document.createElement("script");
    script.id = "customer-service-chat-runtime";
    script.async = true;
    script.src = SRC + "?open=" + (openAfterLoad ? "1" : "0") + "&v=20260501";
    script.onload = function () {
      var shell = document.getElementById(ROOT);
      if (shell) shell.remove();
      if (openAfterLoad && window.CustomerServiceChat && window.CustomerServiceChat.open) {
        window.CustomerServiceChat.open();
      }
    };
    document.head.appendChild(script);
  }

  function init() {
    if (window.CustomerServiceChat || document.getElementById(ROOT)) return;
    var style = document.createElement("style");
    style.textContent =
      "#" +
      ROOT +
      "{position:fixed;right:22px;bottom:22px;z-index:2147483000;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
      "#" +
      ROOT +
      " button{width:58px;height:58px;border:0;border-radius:50%;background:#141414;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 14px 32px #0004;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}" +
      "#" +
      ROOT +
      " button:hover{background:#262626;transform:translateY(-1px);box-shadow:0 18px 38px #0005}" +
      "@media(max-width:480px){#" +
      ROOT +
      "{right:14px;bottom:14px}}";
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = ROOT;
    root.innerHTML = '<button type="button" aria-label="Open chat">' + ICON + "</button>";
    root.querySelector("button").addEventListener("click", function () {
      load(true);
    });
    document.body.appendChild(root);
  }

  ready(init);
})();
