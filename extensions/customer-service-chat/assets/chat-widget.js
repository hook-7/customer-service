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
      ".csm{flex:1;overflow-y:auto;background:#fafafa;padding:14px}.csr{display:flex;flex-direction:column;align-items:flex-start;margin:0 0 12px}.csr.visitor{align-items:flex-end}.msg{max-width:82%;font-size:14px;line-height:1.45;padding:10px 13px;word-break:break-word;white-space:pre-wrap}.visitor .msg{background:#111;color:#fff;border-radius:18px 18px 4px 18px}.agent .msg{background:#fff;color:#171717;border:1px solid #e5e5e5;border-radius:18px 18px 18px 4px}.failed .msg{border-color:#fecaca}.meta{font-size:10px;color:#999;margin-top:4px;padding:0 4px;display:flex;align-items:center;gap:6px}.retry{border:0;background:transparent;color:#dc2626;font-size:10px;text-decoration:underline;cursor:pointer;padding:0}" +
      ".typing{display:inline-flex;align-items:center;gap:4px;min-width:34px;height:18px}.typing i{width:6px;height:6px;border-radius:50%;background:#8a8a8a;animation:cstyping 1s infinite ease-in-out}.typing i:nth-child(2){animation-delay:.14s}.typing i:nth-child(3){animation-delay:.28s}@keyframes cstyping{0%,80%,100%{opacity:.35;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}" +
      ".cards{display:grid;gap:8px;width:min(285px,86%);margin:0 0 10px}.pc{background:#fff;border:1px solid #e5e5e5;border-radius:9px;overflow:hidden;display:grid;grid-template-columns:74px 1fr;min-height:86px}.pc img{width:74px;height:100%;min-height:86px;object-fit:cover;background:#f4f4f5}.pcb{padding:8px;min-width:0}.pct{font-weight:700;font-size:13px;line-height:1.25;color:#111;margin-bottom:3px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pcp{font-size:12px;color:#525252;margin-bottom:5px}.pcr{font-size:12px;line-height:1.3;color:#404040;margin-bottom:7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pca{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.add,.view{height:28px;border-radius:7px;border:0;padding:0 9px;font-size:12px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.add{background:#111;color:#fff}.add[disabled]{background:#a3a3a3;cursor:not-allowed}.view{background:#f4f4f5;color:#111}" +
      ".csf{padding:10px 12px 12px;border-top:1px solid #eee}.csi{display:flex;gap:6px;align-items:center;background:#f5f5f5;border-radius:999px;padding:4px 4px 4px 14px}.ipt{flex:1!important;border:0!important;background:transparent!important;outline:0!important;box-shadow:none!important;min-width:0!important;font-size:14px!important;padding:8px 0!important}.send{width:46px;height:36px;border:0;border-radius:999px;background:#111;color:#fff;cursor:pointer;font-size:12px}.send[disabled]{background:#a3a3a3}.empty{text-align:center;color:#737373;font-size:13px;line-height:1.5;padding:32px 14px}.err{color:#dc2626;font-size:12px;text-align:center;margin-top:8px}";
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

  function clientId(prefix) {
    return prefix + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  }

  function messageKey(message) {
    return message && (message.clientMessageId || message.id);
  }

  function numericVariantId(gid) {
    if (!gid) return "";
    var parts = String(gid).split("/");
    return parts[parts.length - 1] || "";
  }

  function signature(messages, showError) {
    return (
      (messages || [])
        .filter(shouldRenderMessage)
        .map(function (message) {
          return [
            messageKey(message),
            message.body,
            message.state || "sent",
            message.createdAt,
          ].join(":");
        })
        .join("|") +
      "|" +
      (showError ? 1 : 0)
    );
  }

  function shouldRenderMessage(message) {
    if (!message) return false;
    if (message.kind === "PRODUCT_RECOMMENDATION") return true;
    if (message.state === "sending" || message.state === "streaming") return true;
    return Boolean(String(message.body || "").trim());
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
          var add =
            p.available && variantId
              ? '<button class="add" data-variant="' + esc(variantId) + '">Add</button>'
              : '<button class="add" disabled>Unavailable</button>';
          var view = p.productUrl
            ? '<a class="view" href="' + esc(p.productUrl) + '">View</a>'
            : "";
          return (
            '<div class="pc">' +
            (p.imageUrl ? '<img src="' + esc(p.imageUrl) + '" alt="' + esc(p.title) + '">' : "") +
            '<div class="pcb"><div class="pct">' +
            esc(p.title) +
            "</div>" +
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

  function messageMeta(message, visitor) {
    var status = message.state || "sent";
    var label = visitor ? "You" : "AI support";
    var text = time(message.createdAt);
    if (status === "sending") text = "sending";
    if (status === "streaming") text = "typing";
    if (status === "failed") text = "failed";

    var retry =
      visitor && status === "failed"
        ? '<button class="retry" data-cmid="' + esc(message.clientMessageId || message.id) + '">Retry</button>'
        : "";
    return '<div class="meta"><span>' + label + " · " + text + "</span>" + retry + "</div>";
  }

  function renderMessage(message) {
    if (message.kind === "PRODUCT_RECOMMENDATION") {
      return productCards(message);
    }

    var visitor = message.sender === "VISITOR";
    var stateClass = message.state === "failed" ? " failed" : "";
    var typing = message.state === "streaming" && !String(message.body || "").trim();
    var body = typing
      ? '<span class="typing" aria-label="AI is typing"><i></i><i></i><i></i></span>'
      : esc(message.body || "");
    return (
      '<div class="csr ' +
      (visitor ? "visitor" : "agent") +
      stateClass +
      '"><div class="msg">' +
      body +
      "</div>" +
      messageMeta(message, visitor) +
      "</div>"
    );
  }

  function render(el, messages, showError, force) {
    var sig = signature(messages, showError);
    if (!force && el.dataset.sig === sig) return;

    var atBottom = force || el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    var html = (messages || []).filter(shouldRenderMessage).map(renderMessage).join("");
    if (!html) {
      html =
        '<div class="empty">Hi, I am your AI product assistant. Ask me about products or recommendations.</div>';
    }
    if (showError) html += '<div class="err">Support connection failed. Please try again.</div>';

    el.innerHTML = html;
    el.dataset.sig = sig;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  function latestStaffTime(messages) {
    var value = "";
    (messages || []).forEach(function (message) {
      if (!shouldRenderMessage(message)) return;
      if (message.sender !== "VISITOR" && message.createdAt > value) value = message.createdAt;
    });
    return value;
  }

  function hasUnread(messages, watermark) {
    watermark = watermark || "";
    return (messages || []).some(function (message) {
      if (!shouldRenderMessage(message)) return false;
      return message.sender !== "VISITOR" && message.createdAt > watermark;
    });
  }

  function normalizeServerMessage(message) {
    var copy = {};
    Object.keys(message || {}).forEach(function (key) {
      copy[key] = message[key];
    });
    copy.state = "sent";
    return copy;
  }

  function mergeMessages(localMessages, serverMessages) {
    var byKey = {};
    var order = [];

    function put(message) {
      var key = messageKey(message);
      if (!key) return;
      if (!byKey[key]) order.push(key);
      byKey[key] = message;
    }

    (localMessages || []).forEach(function (message) {
      if (!message) return;
      put(message);
    });

    (serverMessages || []).forEach(function (message) {
      if (!message) return;
      put(normalizeServerMessage(message));
    });

    return order
      .map(function (key) {
        return byKey[key];
      })
      .filter(Boolean)
      .sort(function (a, b) {
        var diff = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
        if (diff) return diff;
        return String(messageKey(a) || "").localeCompare(String(messageKey(b) || ""));
      });
  }

  function updateMessage(messages, key, updater) {
    var found = false;
    var next = (messages || []).map(function (message) {
      if (messageKey(message) !== key) return message;
      found = true;
      var copy = {};
      Object.keys(message).forEach(function (field) {
        copy[field] = message[field];
      });
      updater(copy);
      return copy;
    });
    return { found: found, messages: next };
  }

  function markMessage(messages, key, state) {
    return updateMessage(messages, key, function (message) {
      message.state = state;
    }).messages;
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
      '<div class="csw" id="CSW"><div class="csp"><div class="csh"><div><div class="cst">AI Support</div><div class="css">Product help and recommendations</div></div><button class="csx" id="CSX">x</button></div><div class="csm" id="CSM"></div><div class="csf"><div class="csi"><input class="ipt" id="CSI" placeholder="Ask about products..." autocomplete="off"><button class="send" id="CSS">Send</button></div></div></div><button class="csl" id="CSL"><span class="csb" id="CSB"></span>' +
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
      state.messages = mergeMessages(state.messages, data && data.messages ? data.messages : []);
      state.error = Boolean(data && data.error);
      if (!state.open) B.classList.toggle("on", hasUnread(state.messages, state.watermark));
      if (state.open) render(M, state.messages, state.error && !state.messages.length);
    }

    function poll() {
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

    function ensureAssistantPlaceholder(requestId) {
      var key = "ai-" + requestId;
      var updated = updateMessage(state.messages, key, function () {});
      if (updated.found) return;
      state.messages = mergeMessages(state.messages, [
        {
          id: key,
          clientMessageId: key,
          sender: "AI",
          kind: "TEXT",
          body: "",
          metadata: null,
          state: "streaming",
          createdAt: new Date(Date.now() + 1).toISOString(),
        },
      ]);
    }

    function clearAssistantPlaceholder(requestId, serverMessages) {
      var key = "ai-" + requestId;
      var confirmed = (serverMessages || []).some(function (message) {
        return messageKey(message) === key;
      });
      if (confirmed) return;

      state.messages = state.messages.filter(function (message) {
        if (messageKey(message) !== key) return true;
        return Boolean(String(message.body || "").trim());
      });
    }

    function handleStreamLine(line, requestId, requestState) {
      if (!line) return;
      var event = JSON.parse(line);
      if (event.type === "ack" && event.message) {
        requestState.acked = true;
        requestState.aiEnabled = event.aiEnabled === true;
        state.error = false;
        state.messages = mergeMessages(state.messages, [event.message]);
        if (requestState.aiEnabled) ensureAssistantPlaceholder(requestId);
        else clearAssistantPlaceholder(requestId, []);
        render(M, state.messages, false, true);
      } else if (event.type === "assistant_delta" && event.text) {
        ensureAssistantPlaceholder(requestId);
        state.messages = updateMessage(state.messages, "ai-" + requestId, function (message) {
          message.body = (message.body || "") + event.text;
          message.state = "streaming";
        }).messages;
        render(M, state.messages, false, true);
      } else if (event.type === "assistant_done" && event.messages) {
        state.error = false;
        state.messages = mergeMessages(state.messages, event.messages);
        render(M, state.messages, false, true);
      } else if (event.type === "done" && event.messages) {
        state.error = !event.ok;
        state.messages = mergeMessages(state.messages, event.messages);
        clearAssistantPlaceholder(requestId, event.messages);
        render(M, state.messages, state.error && !state.messages.length, true);
      } else if (event.type === "error") {
        throw new Error(event.error || "stream_failed");
      }
    }

    function sendFallback(text, requestId, requestState) {
      return fetch(endpoint(id), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ body: text, clientMessageId: requestId }),
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
          if (result && result.ok && result.json) {
            requestState.acked = Boolean(result.json.ack);
            requestState.aiEnabled = result.json.aiEnabled === true;
            state.error = false;
            state.messages = mergeMessages(
              state.messages,
              result.json.messages || (result.json.ack ? [result.json.ack] : []),
            );
            clearAssistantPlaceholder(requestId, result.json.messages || []);
            render(M, state.messages, false, true);
          } else {
            throw new Error("send_failed");
          }
        });
    }

    function sendStream(text, requestId, requestState) {
      if (!window.ReadableStream || !window.TextDecoder) {
        return sendFallback(text, requestId, requestState);
      }

      return fetch(endpoint(id, true), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ body: text, clientMessageId: requestId }),
      }).then(function (res) {
        if (!res.ok || !res.body) throw new Error("stream_unavailable");
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";

        function pump() {
          return reader.read().then(function (result) {
            if (result.done) {
              if (buffer.trim()) handleStreamLine(buffer.trim(), requestId, requestState);
              return;
            }
            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split(/\n/);
            buffer = lines.pop() || "";
            lines.forEach(function (line) {
              handleStreamLine(line.trim(), requestId, requestState);
            });
            return pump();
          });
        }

        return pump();
      });
    }

    function appendLocalSend(text, requestId) {
      state.messages = mergeMessages(state.messages, [
        {
          id: requestId,
          clientMessageId: requestId,
          sender: "VISITOR",
          kind: "TEXT",
          body: text,
          metadata: null,
          state: "sending",
          createdAt: new Date().toISOString(),
        },
        {
          id: "ai-" + requestId,
          clientMessageId: "ai-" + requestId,
          sender: "AI",
          kind: "TEXT",
          body: "",
          metadata: null,
          state: "streaming",
          createdAt: new Date(Date.now() + 1).toISOString(),
        },
      ]);
      render(M, state.messages, false, true);
    }

    function handleSendFailure(requestId, requestState) {
      var failed = true;
      if (requestState.acked && requestState.aiEnabled) {
        ensureAssistantPlaceholder(requestId);
        state.messages = updateMessage(state.messages, "ai-" + requestId, function (message) {
          message.body =
            message.body ||
            "AI support is temporarily unavailable. Please try again or wait for staff.";
          message.state = "failed";
        }).messages;
      } else if (requestState.acked) {
        clearAssistantPlaceholder(requestId, []);
        failed = false;
      } else {
        state.messages = markMessage(state.messages, requestId, "failed");
        state.messages = state.messages.filter(function (message) {
          return messageKey(message) !== "ai-" + requestId;
        });
      }
      state.error = failed;
      render(M, state.messages, false, true);
    }

    function sendExisting(message) {
      if (!message || state.sending) return;
      var requestId = message.clientMessageId || message.id;
      var requestState = { acked: false, aiEnabled: false };
      state.messages = markMessage(state.messages, requestId, "sending");
      render(M, state.messages, false, true);
      setSending(true);
      sendStream(message.body, requestId, requestState)
        .catch(function () {
          handleSendFailure(requestId, requestState);
        })
        .finally(function () {
          setSending(false);
          I.focus();
        });
    }

    function send() {
      var text = I.value.trim();
      if (!text || state.sending) return;
      I.value = "";
      var requestId = clientId("client");
      var requestState = { acked: false, aiEnabled: false };
      appendLocalSend(text, requestId);
      setSending(true);

      sendStream(text, requestId, requestState)
        .catch(function () {
          handleSendFailure(requestId, requestState);
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
      if (target && target.classList && target.classList.contains("retry")) {
        var id = target.getAttribute("data-cmid");
        var message = state.messages.find(function (item) {
          return messageKey(item) === id;
        });
        sendExisting(message);
      }
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
