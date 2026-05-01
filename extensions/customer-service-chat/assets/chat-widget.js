(function () {
  var VISITOR_KEY = "customer-service-chat-visitor";
  var POLL_MS = 3500;
  var API_ROOT = "/apps/cs/conversation/";
  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>';

  function visitorId() {
    try {
      var existing = localStorage.getItem(VISITOR_KEY);
      if (existing) return existing;
      var id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
      return id;
    } catch (error) {
      return null;
    }
  }

  function endpoint(id, stream) {
    return API_ROOT + encodeURIComponent(id) + (stream ? "?stream=1" : "");
  }

  function root() {
    var el = document.getElementById("customer-service-chat-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "customer-service-chat-root";
      document.body.appendChild(el);
    }
    return el;
  }

  function css() {
    if (document.getElementById("customer-service-chat-styles")) return;
    var el = document.createElement("style");
    el.id = "customer-service-chat-styles";
    el.textContent =
      "#customer-service-chat-root{font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
      ".csw{position:fixed;z-index:2147483000;right:22px;bottom:22px}" +
      ".csl{position:absolute;right:0;bottom:0;width:56px;height:56px;border:0;border-radius:50%;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 10px 28px #0003}" +
      ".csb{position:absolute;top:4px;right:4px;width:9px;height:9px;border-radius:50%;background:#dc2626;display:none}.csb.on{display:block}" +
      ".csp{position:absolute;right:0;bottom:72px;width:min(390px,calc(100vw - 32px));height:min(590px,calc(100vh - 96px));background:#fff;border:1px solid #e5e5e5;border-radius:18px;box-shadow:0 22px 60px #0003;display:flex;flex-direction:column;overflow:hidden;opacity:0;visibility:hidden;transform:translateY(8px) scale(.98);transition:.2s}.csw.open .csp{opacity:1;visibility:visible;transform:none}" +
      ".csh{padding:16px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;gap:12px}.cst{font-size:15px;font-weight:700;color:#111}.css{font-size:12px;color:#737373;margin-top:2px}.csx{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:#525252;font-size:20px;cursor:pointer}.csx:hover{background:#f5f5f5}" +
      ".csm{flex:1;overflow-y:auto;background:#fafafa;padding:14px}.csr{display:flex;flex-direction:column;align-items:flex-start;margin:0 0 12px}.csr.visitor{align-items:flex-end}.msg{max-width:82%;font-size:14px;line-height:1.45;padding:10px 13px;word-break:break-word;white-space:pre-wrap}.visitor .msg{background:#111;color:#fff;border-radius:18px 18px 4px 18px}.agent .msg{background:#fff;color:#171717;border:1px solid #e5e5e5;border-radius:18px 18px 18px 4px}.meta{font-size:10px;color:#999;margin-top:4px;padding:0 4px}" +
      ".cards{display:grid;gap:10px;width:100%;margin:2px 0 12px}.pc{background:#fff;border:1px solid #e5e5e5;border-radius:10px;overflow:hidden}.pc img{width:100%;aspect-ratio:4/3;object-fit:cover;background:#f4f4f5}.pcb{padding:11px}.pct{font-weight:700;font-size:14px;color:#111;margin-bottom:4px}.pcp{font-size:13px;color:#525252;margin-bottom:7px}.pcr{font-size:12px;color:#404040;margin-bottom:8px}.pca{display:flex;gap:8px;align-items:center}.add,.view{height:34px;border-radius:8px;border:0;padding:0 11px;font-size:13px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.add{background:#111;color:#fff}.add[disabled]{background:#a3a3a3;cursor:not-allowed}.view{background:#f4f4f5;color:#111}" +
      ".csf{padding:10px 12px 12px;border-top:1px solid #eee}.csi{display:flex;gap:6px;align-items:center;background:#f5f5f5;border-radius:999px;padding:4px 4px 4px 14px}.ipt{flex:1!important;border:0!important;background:transparent!important;outline:0!important;box-shadow:none!important;min-width:0!important;font-size:14px!important;padding:8px 0!important}.send{width:36px;height:36px;border:0;border-radius:50%;background:#111;color:#fff;cursor:pointer}.send[disabled]{background:#a3a3a3}.empty{text-align:center;color:#737373;font-size:13px;line-height:1.5;padding:32px 14px}.err{color:#dc2626;font-size:12px;text-align:center;margin-top:8px}";
    document.head.appendChild(el);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function time(value) {
    try {
      return new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return "";
    }
  }

  function numericVariantId(gid) {
    if (!gid) return "";
    var parts = String(gid).split("/");
    return parts[parts.length - 1] || "";
  }

  function signature(messages, showError) {
    var count = (messages && messages.length) || 0;
    var last = count ? messages[count - 1] : null;
    return count + "|" + (last ? last.id + ":" + last.createdAt + ":" + last.body : "") + "|" + (showError ? 1 : 0);
  }

  function productCards(message) {
    var products =
      message &&
      message.metadata &&
      message.metadata.products &&
      message.metadata.products.length
        ? message.metadata.products
        : [];
    if (!products.length) return "";

    return (
      '<div class="cards">' +
      products
        .map(function (p) {
          var variantId = numericVariantId(p.variantGid);
          var price = p.price ? esc(p.price + (p.currencyCode ? " " + p.currencyCode : "")) : "";
          var add = p.available && variantId
            ? '<button class="add" data-variant="' + esc(variantId) + '">Add to cart</button>'
            : '<button class="add" disabled>Unavailable</button>';
          var view = p.productUrl
            ? '<a class="view" href="' + esc(p.productUrl) + '">View</a>'
            : "";
          return (
            '<div class="pc">' +
            (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="' + esc(p.title) + '">' : "") +
            '<div class="pcb"><div class="pct">' +
            esc(p.title) +
            '</div>' +
            (price ? '<div class="pcp">' + price + "</div>" : "") +
            (p.reason ? '<div class="pcr">' + esc(p.reason) + "</div>" : "") +
            '<div class="pca">' +
            add +
            view +
            "</div></div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function renderMessage(message) {
    if (message.kind === "PRODUCT_RECOMMENDATION") {
      return productCards(message);
    }

    var visitor = message.sender === "VISITOR";
    return (
      '<div class="csr ' +
      (visitor ? "visitor" : "agent") +
      '"><div class="msg">' +
      esc(message.body || (message.streaming ? "..." : "")) +
      '</div><div class="meta">' +
      (visitor ? "You" : "AI support") +
      " · " +
      (message.streaming ? "typing" : time(message.createdAt)) +
      "</div></div>"
    );
  }

  function render(el, messages, showError, force) {
    var sig = signature(messages, showError);
    if (!force && el.dataset.sig === sig) return;

    var atBottom = force || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    var html = (messages || []).map(renderMessage).join("");
    if (!html) html = '<div class="empty">Hi, I am your AI product assistant. Ask me about products or recommendations.</div>';
    if (showError) html += '<div class="err">Support connection failed. Please try again.</div>';

    el.innerHTML = html;
    el.dataset.sig = sig;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  function latestStaffTime(messages) {
    var value = "";
    (messages || []).forEach(function (message) {
      if (message.sender !== "VISITOR" && message.createdAt > value) value = message.createdAt;
    });
    return value;
  }

  function hasUnread(messages, watermark) {
    watermark = watermark || "";
    return (messages || []).some(function (message) {
      return message.sender !== "VISITOR" && message.createdAt > watermark;
    });
  }

  function mergeMessages(localMessages, serverMessages, optimisticId) {
    localMessages = (localMessages || []).filter(function (message) {
      return message && message.id !== optimisticId && message.id !== "streaming-ai";
    });
    var byId = {};
    localMessages.forEach(function (message) {
      if (message && message.id) byId[message.id] = true;
    });
    (serverMessages || []).forEach(function (message) {
      if (!message || !message.id || byId[message.id]) return;
      localMessages.push(message);
      byId[message.id] = true;
    });
    localMessages.sort(function (a, b) {
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
    return localMessages;
  }

  function updateMessage(messages, id, updater) {
    return messages.map(function (message) {
      if (message.id !== id) return message;
      var copy = {};
      Object.keys(message).forEach(function (key) {
        copy[key] = message[key];
      });
      updater(copy);
      return copy;
    });
  }

  function init() {
    var id = visitorId();
    if (!id) return;
    css();
    var R = root();
    if (R.dataset.ready === "1") return;
    R.dataset.ready = "1";

    var state = { open: false, messages: [], watermark: "", error: false, sending: false };
    R.innerHTML =
      '<div class="csw" id="CSW"><div class="csp"><div class="csh"><div><div class="cst">AI Support</div><div class="css">Product help and recommendations</div></div><button class="csx" id="CSX">x</button></div><div class="csm" id="CSM"></div><div class="csf"><div class="csi"><input class="ipt" id="CSI" placeholder="Ask about products..." autocomplete="off"><button class="send" id="CSS">↑</button></div></div></div><button class="csl" id="CSL"><span class="csb" id="CSB"></span>' +
      ICON +
      "</button></div>";

    var W = document.getElementById("CSW");
    var M = document.getElementById("CSM");
    var I = document.getElementById("CSI");
    var B = document.getElementById("CSB");
    var L = document.getElementById("CSL");
    var X = document.getElementById("CSX");
    var S = document.getElementById("CSS");

    function open(value) {
      var wasOpen = state.open;
      state.open = value;
      W.classList.toggle("open", value);
      if (value) {
        B.classList.remove("on");
        M.dataset.sig = "";
        render(M, state.messages, state.error && !state.messages.length, true);
        setTimeout(function () {
          I.focus();
        }, 180);
      } else if (wasOpen) {
        state.watermark = latestStaffTime(state.messages);
        B.classList.toggle("on", hasUnread(state.messages, state.watermark));
      }
    }

    function setSending(value) {
      state.sending = value;
      S.disabled = value;
      I.disabled = value;
    }

    function applyData(data) {
      state.messages = data && data.messages ? data.messages : [];
      state.error = Boolean(data && data.error);
      if (!state.open) B.classList.toggle("on", hasUnread(state.messages, state.watermark));
      if (state.open) render(M, state.messages, state.error && !state.messages.length);
    }

    function poll() {
      if (state.sending) return;
      fetch(endpoint(id), { headers: { Accept: "application/json" } })
        .then(function (res) {
          if ((res.headers.get("content-type") || "").toLowerCase().indexOf("json") === -1) {
            return null;
          }
          return res.json();
        })
        .then(function (data) {
          if (!data) {
            state.error = true;
            if (state.open) render(M, state.messages, !state.messages.length);
            return;
          }
          applyData(data);
        })
        .catch(function () {
          state.error = true;
          if (state.open) render(M, state.messages, !state.messages.length);
        });
    }

    function sendFallback(text, pid) {
      return fetch(endpoint(id), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ body: text }),
      })
        .then(function (res) {
          if ((res.headers.get("content-type") || "").toLowerCase().indexOf("json") === -1) {
            return null;
          }
          return res.json().then(function (json) {
            return { ok: res.ok, json: json };
          });
        })
        .then(function (result) {
          if (result && result.ok && result.json && result.json.messages) {
            state.error = false;
            state.messages = mergeMessages(state.messages, result.json.messages, pid);
            render(M, state.messages, false);
          } else {
            throw new Error("send_failed");
          }
        });
    }

    function handleStreamLine(line, pid) {
      if (!line) return;
      var event = JSON.parse(line);
      if (event.type === "delta" && event.text) {
        state.messages = updateMessage(state.messages, "streaming-ai", function (message) {
          message.body = (message.body || "") + event.text;
        });
        render(M, state.messages, false, true);
      } else if (event.type === "done" && event.messages) {
        state.error = false;
        state.messages = mergeMessages(state.messages, event.messages, pid);
        render(M, state.messages, false, true);
      } else if (event.type === "error") {
        throw new Error(event.error || "stream_failed");
      }
    }

    function sendStream(text, pid) {
      if (!window.ReadableStream || !window.TextDecoder) return sendFallback(text, pid);

      return fetch(endpoint(id, true), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ body: text }),
      }).then(function (res) {
        if (!res.ok || !res.body) throw new Error("stream_unavailable");
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              if (buffer.trim()) handleStreamLine(buffer.trim(), pid);
              return;
            }
            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split(/\n/);
            buffer = lines.pop() || "";
            lines.forEach(function (line) {
              handleStreamLine(line.trim(), pid);
            });
            return pump();
          });
        }

        return pump();
      });
    }

    function send() {
      var text = I.value.trim();
      if (!text || state.sending) return;
      I.value = "";
      setSending(true);
      var pid = "local-" + Date.now() + Math.random().toString(36).slice(2, 8);
      state.messages = state.messages.concat([
        {
          id: pid,
          sender: "VISITOR",
          kind: "TEXT",
          body: text,
          createdAt: new Date().toISOString(),
        },
        {
          id: "streaming-ai",
          sender: "AI",
          kind: "TEXT",
          body: "",
          streaming: true,
          createdAt: new Date().toISOString(),
        },
      ]);
      render(M, state.messages, false, true);

      sendStream(text, pid)
        .catch(function () {
          state.messages = state.messages.filter(function (message) {
            return message.id !== pid && message.id !== "streaming-ai";
          });
          state.error = true;
          render(M, state.messages, !state.messages.length, true);
        })
        .finally(function () {
          setSending(false);
          I.focus();
        });
    }

    function addToCart(button) {
      var variantId = button.getAttribute("data-variant");
      if (!variantId) return;
      button.disabled = true;
      button.textContent = "Adding";
      fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: Number(variantId), quantity: 1 }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("cart_add_failed");
          button.textContent = "Added";
        })
        .catch(function () {
          button.disabled = false;
          button.textContent = "Retry";
        });
    }

    L.addEventListener("click", function () {
      open(!state.open);
    });
    X.addEventListener("click", function (event) {
      event.stopPropagation();
      open(false);
    });
    R.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.id === "CSS") send();
      if (target && target.classList && target.classList.contains("add")) addToCart(target);
    });
    R.addEventListener("keydown", function (event) {
      if (event.target && event.target.id === "CSI" && event.key === "Enter") send();
    });

    poll();
    setInterval(poll, POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
