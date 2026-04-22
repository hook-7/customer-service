(function () {
  var K = "customer-service-chat-visitor",
    P = 3500,
    U = "/apps/cs/conversation/",
    I =
      '<svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4a2 2 0 00-2 2v16l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>';
  function vid() {
    try {
      var e = localStorage.getItem(K);
      if (e) return e;
      var id = crypto.randomUUID();
      localStorage.setItem(K, id);
      return id;
    } catch (t) {
      return null;
    }
  }
  function url(v) {
    return U + encodeURIComponent(v);
  }
  function root() {
    var e = document.getElementById("customer-service-chat-root");
    if (!e) {
      e = document.createElement("div");
      e.id = "customer-service-chat-root";
      document.body.appendChild(e);
    }
    return e;
  }
  function css() {
    if (document.getElementById("customer-service-chat-styles")) return;
    var e = document.createElement("style");
    e.id = "customer-service-chat-styles";
    e.textContent =
      "#customer-service-chat-root{font-family:system-ui,sans-serif}" +
      ".w{position:fixed;z-index:2147483000;bottom:20px;right:20px}.w *{box-sizing:border-box}" +
      ".L{pointer-events:auto;position:absolute;bottom:0;right:0;width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;background:linear-gradient(145deg,#0d9488,#047857);color:#fff;box-shadow:0 4px 14px rgba(5,150,105,.4);display:flex;align-items:center;justify-content:center;transition:transform .15s}.L:hover{transform:scale(1.06)}" +
      ".b{position:absolute;top:5px;right:5px;width:10px;height:10px;background:#ef4444;border-radius:50%;border:2px solid #fff;display:none}.b.on{display:block}" +
      ".p{pointer-events:auto;position:absolute;bottom:72px;right:0;width:min(372px,calc(100vw - 36px));max-height:min(520px,calc(100vh - 100px));display:flex;flex-direction:column;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 10px 36px rgba(15,23,42,.2);border:1px solid #e2e8f0;opacity:0;transform:translateY(10px) scale(.97);transition:opacity .2s,transform .2s;visibility:hidden}.w.o .p{opacity:1;transform:none;visibility:visible}" +
      ".h{background:linear-gradient(145deg,#0f766e,#059669);color:#fff;padding:14px 12px;flex-shrink:0}" +
      ".hr{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}" +
      ".t{font-size:16px;font-weight:700}.s{font-size:12px;opacity:.9;margin-top:3px}" +
      ".x{background:rgba(255,255,255,.2);border:0;border-radius:8px;width:32px;height:32px;color:#fff;font-size:20px;line-height:1;cursor:pointer}" +
      ".c{flex:1;min-height:160px;max-height:300px;overflow-y:auto;padding:12px;background:#f1f5f9}" +
      ".r{display:flex;margin-bottom:8px;width:100%}.rv{justify-content:flex-end}.rs{justify-content:flex-start}" +
      ".m{max-width:80%;padding:8px 12px;font-size:14px;line-height:1.4;word-break:break-word}.mv{background:#0d9488;color:#fff;border-radius:14px 14px 4px 14px}.ms{background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:14px 14px 14px 4px}" +
      ".n{font-size:10px;margin-top:3px;opacity:.7;padding:0 2px}" +
      ".f{flex-shrink:0;padding:8px 10px 10px;border-top:1px solid #e2e8f0}" +
      ".i{display:flex;align-items:center;gap:6px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:999px;padding:3px 3px 3px 12px}.i:focus-within{border-color:#14b8a6}" +
      "input.ipt{flex:1;border:0;background:0;font-size:14px;outline:0;padding:6px 0;min-width:0}" +
      ".z{width:38px;height:38px;border:0;border-radius:50%;background:linear-gradient(145deg,#0d9488,#059669);color:#fff;font-size:15px;cursor:pointer;line-height:1}";
    document.head.appendChild(e);
  }
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function tim(i) {
    try {
      return new Date(i).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }
  function ren(el, msgs, showErr) {
    var h = (msgs || [])
      .map(function (m) {
        var staff = m.sender === "STAFF",
          rc = staff ? "r rs" : "r rv",
          bc = staff ? "m ms" : "m mv",
          lb = staff ? "客服" : "你";
        return (
          '<div class="' +
          rc +
          '"><div><div class="' +
          bc +
          '">' +
          esc(m.body) +
          '</div><div class="n">' +
          lb +
          " · " +
          tim(m.createdAt) +
          "</div></div></div>"
        );
      })
      .join("");
    if (!h) {
      h =
        '<div style="text-align:center;padding:24px 12px;color:#64748b;font-size:14px">你好，需要什么帮助？<br><span style="font-size:12px;opacity:.85">留言后我们会尽快回复</span></div>';
      if (showErr) {
        h +=
          '<p style="margin-top:12px;font-size:12px;color:#b91c1c">无法加载消息。请确认应用已安装、已用 <code>shopify app dev</code> 或线上 URL 启用 App Proxy（路径 <code>/apps/cs/</code>），并在店铺后台重新授权应用。</p>';
      }
    }
    el.innerHTML = h;
    el.scrollTop = el.scrollHeight;
  }
  function max(msgs) {
    var x = "";
    (msgs || []).forEach(function (m) {
      if (m.createdAt > x) x = m.createdAt;
    });
    return x;
  }
  function unr(msgs, w) {
    if (!msgs || !msgs.length) return false;
    w = w || "";
    for (var i = 0; i < msgs.length; i++)
      if (msgs[i].sender === "STAFF" && msgs[i].createdAt > w) return true;
    return false;
  }
  function init() {
    var v = vid();
    if (!v) return;
    css();
    var R = root();
    if (R.dataset.i === "1") return;
    R.dataset.i = "1";
    var st = { o: !1, m: [], k: "", e: 0 };
    R.innerHTML =
      '<div class="w" id="W"><div class="p" id="P" role="dialog" aria-label="在线客服"><div class="h"><div class="hr"><div><div class="t">在线客服</div><div class="s">通常几分钟内回复</div></div><button type="button" class="x" id="X" aria-label="收起">×</button></div></div><div class="c" id="S"></div><div class="f"><div class="i"><input class="ipt" id="N" placeholder="输入消息…" autocomplete="off"><button type="button" class="z" id="B" aria-label="发送">➤</button></div></div></div><button type="button" class="L" id="L" aria-label="打开聊天"><span class="b" id="G"></span>' +
      I +
      "</button></div>";
    var W = document.getElementById("W"),
      S = document.getElementById("S"),
      N = document.getElementById("N"),
      G = document.getElementById("G"),
      L = document.getElementById("L"),
      X = document.getElementById("X");
    function op(e) {
      var p = st.o;
      st.o = e;
      W.classList.toggle("o", e);
      if (e) {
        G.classList.remove("on");
        ren(S, st.m, !!st.e && !(st.m && st.m.length));
        setTimeout(function () {
          N.focus();
        }, 180);
      } else {
        if (p) st.k = max(st.m);
        G.classList.toggle("on", unr(st.m, st.k));
      }
    }
    function ap(d) {
      st.m = d && d.messages ? d.messages : [];
      st.e = d && d.error ? 1 : 0;
      if (G && !st.o) G.classList.toggle("on", unr(st.m, st.k));
      if (S && st.o)
        ren(S, st.m, !!st.e && !(st.m && st.m.length));
    }
    function po() {
      fetch(url(v), { headers: { Accept: "application/json" } })
        .then(function (r) {
          var ct = (r.headers.get("content-type") || "").toLowerCase();
          if (ct.indexOf("json") === -1)
            return Promise.resolve({ body: null });
          return r.json().then(function (body) {
            return { body: body };
          });
        })
        .then(function (x) {
          if (!x || !x.body) {
            st.e = 1;
            if (S && st.o) ren(S, st.m, !st.m || !st.m.length);
            return;
          }
          ap(x.body);
        })
        .catch(function () {
          st.e = 1;
          if (S && st.o) ren(S, st.m, !st.m || !st.m.length);
        });
    }
    function se() {
      var t = N.value.trim();
      if (!t) return;
      N.value = "";
      fetch(url(v), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ body: t }),
      })
        .then(function (r) {
          var ct = (r.headers.get("content-type") || "").toLowerCase();
          if (ct.indexOf("json") === -1) return Promise.resolve(null);
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (r) {
          if (!r || !r.j) {
            st.e = 1;
            if (S && st.o) ren(S, st.m, true);
            return;
          }
          if (r.ok && r.j.messages) ap(r.j);
          else ap(r.j || { error: "request_failed" });
        })
        .catch(function () {
          st.e = 1;
          if (S && st.o) ren(S, st.m, true);
        });
    }
    L.addEventListener("click", function () {
      op(!st.o);
    });
    X.addEventListener("click", function (e) {
      e.stopPropagation();
      op(!1);
    });
    R.addEventListener("click", function (e) {
      if (e.target && e.target.id === "B") se();
    });
    R.addEventListener("keydown", function (e) {
      if (e.target && e.target.id === "N" && e.key === "Enter") se();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && st.o) op(!1);
    });
    po();
    setInterval(po, P);
  }
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
