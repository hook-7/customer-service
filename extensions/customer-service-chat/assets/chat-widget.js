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
      ".w{position:fixed;z-index:2147483000;bottom:22px;right:22px}" +
      ".L{position:absolute;bottom:0;right:0;width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;background:#0a0a0a;color:#fff;box-shadow:0 6px 20px #0002;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}.L:focus{outline:0}.L:focus-visible{outline:0;box-shadow:0 6px 20px #0002,0 0 0 3px #0a0a0a33}" +
      ".b{position:absolute;top:4px;right:4px;width:9px;height:9px;background:#ef4444;border-radius:50%;display:none}.b.on{display:block}" +
      ".p{position:absolute;bottom:72px;right:0;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 96px));display:flex;flex-direction:column;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ececec;box-shadow:0 20px 50px -12px #0003;opacity:0;transform:translateY(8px) scale(.98);transition:.22s;visibility:hidden}.w.o .p{opacity:1;transform:none;visibility:visible}" +
      ".h{padding:16px;border-bottom:1px solid #f0f0f0}" +
      ".hr{display:flex;justify-content:space-between;align-items:center;gap:8px}" +
      ".ti{display:flex;align-items:center;gap:10px}" +
      ".av{width:36px;height:36px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;position:relative}" +
      ".av::after{content:'';position:absolute;right:-1px;bottom:-1px;width:10px;height:10px;background:#10b981;border-radius:50%;border:2px solid #fff}" +
      ".t{font-size:15px;font-weight:600;color:#0a0a0a}.s{font-size:12px;color:#737373;margin-top:2px}" +
      ".x{background:0;border:0;border-radius:8px;width:30px;height:30px;color:#525252;font-size:20px;cursor:pointer;-webkit-tap-highlight-color:transparent}.x:hover{background:#f5f5f5}.x:focus{outline:0}.x:focus-visible{outline:0;box-shadow:0 0 0 3px #0a0a0a1f}" +
      ".c{flex:1;overflow-y:auto;padding:16px 14px;background:#fafafa}" +
      ".r{display:flex;flex-direction:column;align-items:flex-start;margin-bottom:10px}.rv{align-items:flex-end}" +
      ".m{max-width:78%;padding:10px 14px;font-size:14px;line-height:1.5;word-break:break-word}" +
      ".mv{background:#0a0a0a;color:#fafafa;border-radius:18px 18px 4px 18px}" +
      ".ms{background:#fff;color:#171717;border:1px solid #ececec;border-radius:18px 18px 18px 4px}" +
      ".n{font-size:10px;margin-top:4px;padding:0 4px;color:#a3a3a3}" +
      ".f{padding:10px 12px 12px;border-top:1px solid #f0f0f0}" +
      ".i{display:flex;align-items:center;gap:6px;background:#f5f5f5;border:1px solid transparent;border-radius:999px;padding:3px 3px 3px 14px}.i:focus-within{background:#fff;border-color:#d4d4d4;box-shadow:0 0 0 3px #0a0a0a0f}" +
      "#customer-service-chat-root input.ipt,#customer-service-chat-root input.ipt:focus,#customer-service-chat-root input.ipt:focus-visible,#customer-service-chat-root input.ipt:active,#customer-service-chat-root input.ipt:hover{flex:1!important;border:0!important;background:transparent!important;font-size:14px!important;outline:0!important;box-shadow:none!important;padding:8px 0!important;min-width:0!important;color:#0a0a0a!important;border-radius:0!important;margin:0!important;-webkit-appearance:none!important;appearance:none!important}#customer-service-chat-root input.ipt::placeholder{color:#a3a3a3!important}" +
      ".z{width:36px;height:36px;border:0;border-radius:50%;background:#0a0a0a;color:#fff;font-size:14px;cursor:pointer;-webkit-tap-highlight-color:transparent}.z:focus{outline:0}.z:focus-visible{outline:0;box-shadow:0 0 0 3px #0a0a0a33}" +
      ".ce{text-align:center;padding:32px 14px;font-size:13px;color:#737373;line-height:1.6}.er{color:#dc2626;font-size:12px;margin-top:10px}";
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
  function sig(msgs, showErr) {
    var n = (msgs && msgs.length) || 0;
    var last = n ? msgs[n - 1] : null;
    return n + "|" + (last ? (last.id || "") + ":" + (last.createdAt || "") : "") + "|" + (showErr ? 1 : 0);
  }
  function ren(el, msgs, showErr, force) {
    var ns = sig(msgs, showErr);
    if (!force && el.dataset.sig === ns) return;
    var atBottom = force || (el.scrollHeight - el.scrollTop - el.clientHeight < 40);
    var h = (msgs || [])
      .map(function (m) {
        var staff = m.sender === "STAFF",
          rc = staff ? "r rs" : "r rv",
          bc = staff ? "m ms" : "m mv",
          lb = staff ? "客服" : "你";
        return (
          '<div class="' +
          rc +
          '"><div class="' +
          bc +
          '">' +
          esc(m.body) +
          '</div><div class="n">' +
          lb +
          " · " +
          tim(m.createdAt) +
          "</div></div>"
        );
      })
      .join("");
    if (!h) {
      h = '<div class="ce">有什么可以帮你的吗？<br>留言后我们尽快回复</div>';
      if (showErr) h += '<p class="er">连接失败</p>';
    }
    el.innerHTML = h;
    el.dataset.sig = ns;
    if (atBottom) el.scrollTop = el.scrollHeight;
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
      '<div class="w" id="W"><div class="p"><div class="h"><div class="hr"><div class="ti"><div class="av">CS</div><div><div class="t">在线客服</div><div class="s">在线 · 尽快回复</div></div></div><button class="x" id="X">×</button></div></div><div class="c" id="S"></div><div class="f"><div class="i"><input class="ipt" id="N" placeholder="输入消息…" autocomplete="off"><button class="z" id="B">→</button></div></div></div><button class="L" id="L"><span class="b" id="G"></span>' +
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
        S.dataset.sig = "";
        ren(S, st.m, !!st.e && !(st.m && st.m.length), true);
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
      var pid = "L" + Date.now() + Math.random().toString(36).slice(2, 8);
      st.m = (st.m || []).concat([
        { id: pid, sender: "VISITOR", body: t, createdAt: new Date().toISOString() },
      ]);
      if (S && st.o) ren(S, st.m, !!st.e && !(st.m && st.m.length), true);
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
          st.m = (st.m || []).filter(function (x) { return x.id != pid; });
          if (!r || !r.j) { st.e = 1; if (S && st.o) ren(S, st.m, !st.m || !st.m.length); return; }
          if (r.ok && r.j.messages) { st.e = 0; ap(r.j); } else { st.e = 1; if (S && st.o) ren(S, st.m, !st.m || !st.m.length); }
        })
        .catch(function () {
          st.m = (st.m || []).filter(function (x) { return x.id != pid; });
          st.e = 1;
          if (S && st.o) ren(S, st.m, !st.m || !st.m.length);
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
    po();
    setInterval(po, P);
  }
  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
