import type { LoaderFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";

const widgetScript = String.raw`
(function () {
  var VISITOR_KEY = "customer-service-chat-visitor";
  var POLL_MS = 3500;
  var API_ROOT = "/apps/cs/conversation/";
  var ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v16l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>';
  var SEND_ICON =
    '<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m3.4 20.4 17.45-7.48c.86-.37.86-1.59 0-1.96L3.4 3.48c-.7-.3-1.43.34-1.24 1.08L4 11.5l9.5.5-9.5.5-1.84 6.82c-.2.75.54 1.39 1.24 1.08z"/></svg>';
  var AUTO_OPEN = false;

  try {
    AUTO_OPEN =
      document.currentScript &&
      new URL(document.currentScript.src, location.href).searchParams.get("open") === "1";
  } catch (error) {}

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
      "#customer-service-chat-root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717}" +
      ".csw{position:fixed;z-index:2147483000;right:22px;bottom:22px}" +
      ".csl{position:absolute;right:0;bottom:0;width:58px;height:58px;border:0;border-radius:50%;background:#141414;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 14px 32px #0004;transition:transform .18s ease,box-shadow .18s ease,background .18s ease}.csl:hover{background:#262626;transform:translateY(-1px);box-shadow:0 18px 38px #0005}.csl:active{transform:translateY(0) scale(.98)}" +
      ".csb{position:absolute;top:4px;right:4px;width:10px;height:10px;border-radius:50%;background:#ef4444;border:2px solid #fff;display:none}.csb.on{display:block}" +
      ".csp{position:absolute;right:0;bottom:74px;width:min(400px,calc(100vw - 32px));height:min(610px,calc(100vh - 98px));background:#fff;border:1px solid #e7e5e4;border-radius:18px;box-shadow:0 24px 70px #00000040;display:flex;flex-direction:column;overflow:hidden;opacity:0;visibility:hidden;transform:translateY(10px) scale(.985);transition:opacity .18s ease,transform .18s ease,visibility .18s ease}.csw.open .csp{opacity:1;visibility:visible;transform:none}" +
      ".csh{padding:15px 16px;border-bottom:1px solid #eeeae7;display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(180deg,#fff,#fbfaf8)}" +
      ".csh-main{display:flex;align-items:center;gap:10px;min-width:0}.avatar{width:34px;height:34px;border-radius:10px;background:#141414;color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.cst{font-size:15px;font-weight:750;color:#111;line-height:1.2}.cssub{font-size:12px;color:#737373;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.csx{width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:#525252;font-size:22px;line-height:1;cursor:pointer}.csx:hover{background:#f3f0ec;color:#111}" +
      ".csm{flex:1;overflow-y:auto;background:#f8f7f5;padding:15px 14px 16px;scrollbar-width:thin}.csm::-webkit-scrollbar{width:8px}.csm::-webkit-scrollbar-thumb{background:#d6d3d1;border-radius:999px;border:2px solid #f8f7f5}" +
      ".csr{display:flex;flex-direction:column;align-items:flex-start;margin:0 0 13px}.csr.visitor{align-items:flex-end}.msg{max-width:84%;font-size:14px;line-height:1.45;padding:10px 13px;word-break:break-word;white-space:pre-wrap;box-shadow:0 1px 1px #0000000a}.visitor .msg{background:#141414;color:#fff;border-radius:18px 18px 5px 18px}.agent .msg{background:#fff;color:#171717;border:1px solid #e7e5e4;border-radius:18px 18px 18px 5px}.failed .msg{border-color:#fecaca;background:#fff7f7}.streaming .msg{border-color:#ddd6ce}" +
      ".meta{font-size:10px;color:#9a918a;margin-top:4px;padding:0 5px;display:flex;align-items:center;gap:7px}.retry{border:0;background:transparent;color:#dc2626;font-size:10px;text-decoration:underline;cursor:pointer;padding:0}" +
      ".typing{display:inline-flex;align-items:center;gap:4px;min-width:34px;height:18px}.typing i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#8a817b;animation:cstyping 1s infinite ease-in-out}.typing i:nth-child(2){animation-delay:.14s}.typing i:nth-child(3){animation-delay:.28s}@keyframes cstyping{0%,80%,100%{opacity:.32;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}" +
      ".cards{display:grid;gap:9px;width:min(310px,88%);margin:0 0 12px}.pc{background:#fff;border:1px solid #e7e5e4;border-radius:10px;overflow:hidden;display:grid;grid-template-columns:76px 1fr;min-height:90px;box-shadow:0 1px 2px #0000000a}.pc img{width:76px;height:100%;min-height:90px;object-fit:cover;background:#f4f4f5}.pcb{padding:9px;min-width:0}.pct{font-weight:750;font-size:13px;line-height:1.25;color:#111;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pcp{font-size:12px;color:#525252;margin-bottom:5px}.pcr{font-size:12px;line-height:1.3;color:#57534e;margin-bottom:7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.pca{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.add,.view{height:28px;border-radius:7px;border:0;padding:0 10px;font-size:12px;font-weight:650;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.add{background:#141414;color:#fff}.add[disabled]{background:#a8a29e;cursor:not-allowed}.view{background:#f1efec;color:#171717}.view:hover{background:#e7e5e4}" +
      ".csf{padding:10px 12px 12px;border-top:1px solid #eeeae7;background:#fff}.csi{display:flex;gap:7px;align-items:center;background:#f4f2ef;border:1px solid transparent;border-radius:999px;padding:4px 5px 4px 14px;transition:border-color .15s ease,background .15s ease}.csi:focus-within{background:#fff;border-color:#d6d3d1}.ipt{flex:1!important;border:0!important;background:transparent!important;outline:0!important;box-shadow:none!important;min-width:0!important;font-size:14px!important;padding:9px 0!important;color:#171717!important}.ipt::placeholder{color:#9a918a}.send{width:38px;height:38px;border:0;border-radius:50%;background:#141414;color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s ease,transform .15s ease}.send:hover{background:#262626}.send:active{transform:scale(.96)}.send[disabled]{background:#a8a29e;cursor:not-allowed}" +
      ".empty{text-align:center;color:#78716c;font-size:13px;line-height:1.5;padding:34px 18px}.err{color:#dc2626;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;font-size:12px;text-align:center;margin-top:8px;padding:8px 10px}" +
      "@media(max-width:480px){.csw{right:14px;bottom:14px}.csp{right:-2px;bottom:70px;width:calc(100vw - 24px);height:min(610px,calc(100vh - 88px));border-radius:16px}.cards{width:92%}}";
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

  function requestThreadKey(message) {
    var key = String(messageKey(message) || "");
    if (key.indexOf("ai-products-") === 0) return key.slice("ai-products-".length);
    if (key.indexOf("ai-") === 0) return key.slice("ai-".length);
    if (key.indexOf("client-") === 0) return key;
    return "";
  }

  function requestMessageRank(message) {
    var key = String(messageKey(message) || "");
    if (message && message.sender === "VISITOR") return 0;
    if (key.indexOf("ai-products-") === 0 || (message && message.kind === "PRODUCT_RECOMMENDATION")) {
      return 2;
    }
    if (key.indexOf("ai-") === 0 || (message && message.sender !== "VISITOR")) return 1;
    return 3;
  }

  function numericVariantId(gid) {
    if (!gid) return "";
    var parts = String(gid).split("/");
    return parts[parts.length - 1] || "";
  }

  function shouldRenderMessage(message) {
    if (!message) return false;
    if (message.kind === "PRODUCT_RECOMMENDATION") return true;
    if (message.state === "sending" || message.state === "streaming") return true;
    return Boolean(String(message.body || "").trim());
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
    return '<div class="meta"><span>' + label + " - " + text + "</span>" + retry + "</div>";
  }

  function renderMessage(message) {
    if (message.kind === "PRODUCT_RECOMMENDATION") return productCards(message);

    var visitor = message.sender === "VISITOR";
    var stateClass = message.state === "failed" ? " failed" : "";
    if (message.state === "streaming") stateClass += " streaming";
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
      if (message) put(message);
    });
    (serverMessages || []).forEach(function (message) {
      if (message) put(normalizeServerMessage(message));
    });

    return order
      .map(function (key) {
        return byKey[key];
      })
      .filter(Boolean)
      .sort(function (a, b) {
        var aThread = requestThreadKey(a);
        var bThread = requestThreadKey(b);
        if (aThread && aThread === bThread) {
          var rankDiff = requestMessageRank(a) - requestMessageRank(b);
          if (rankDiff) return rankDiff;
        }
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

  function boot() {
    var id = visitorId();
    if (!id) return;
    css();
    var R = root();
    if (R.dataset.ready === "1") {
      if (AUTO_OPEN && window.CustomerServiceChat && window.CustomerServiceChat.open) {
        window.CustomerServiceChat.open();
      }
      return;
    }
    R.dataset.ready = "1";

    var state = { open: false, messages: [], watermark: "", error: false, sending: false };
    var pollInFlight = false;
    R.innerHTML =
      '<div class="csw" id="CSW"><div class="csp"><div class="csh"><div class="csh-main"><div class="avatar">' +
      ICON +
      '</div><div><div class="cst">AI Support</div><div class="cssub">Product help and recommendations</div></div></div><button class="csx" id="CSX" aria-label="Close">x</button></div><div class="csm" id="CSM"></div><div class="csf"><div class="csi"><input class="ipt" id="CSI" placeholder="Ask about products..." autocomplete="off"><button class="send" id="CSS" aria-label="Send">' +
      SEND_ICON +
      '</button></div></div></div><button class="csl" id="CSL" aria-label="Open chat"><span class="csb" id="CSB"></span>' +
      ICON +
      "</button></div>";

    var W = document.getElementById("CSW");
    var M = document.getElementById("CSM");
    var I = document.getElementById("CSI");
    var B = document.getElementById("CSB");
    var L = document.getElementById("CSL");
    var X = document.getElementById("CSX");
    var S = document.getElementById("CSS");

    function setOpen(value) {
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

    window.CustomerServiceChat = {
      open: function () {
        setOpen(true);
      },
      close: function () {
        setOpen(false);
      },
    };

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
      if (pollInFlight) return Promise.resolve();
      pollInFlight = true;
      return fetch(endpoint(id), { headers: { Accept: "application/json" } })
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
        })
        .finally(function () {
          pollInFlight = false;
        });
    }

    function preloadConversation() {
      return poll();
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
      ensureAssistantPlaceholder(requestId);
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
      setOpen(!state.open);
    });
    X.addEventListener("click", function (event) {
      event.stopPropagation();
      setOpen(false);
    });
    R.addEventListener("click", function (event) {
      var target = event.target;
      if (target && target.id === "CSS") send();
      if (target && target.classList && target.classList.contains("add")) addToCart(target);
      if (target && target.classList && target.classList.contains("retry")) {
        var retryId = target.getAttribute("data-cmid");
        var message = state.messages.find(function (item) {
          return messageKey(item) === retryId;
        });
        sendExisting(message);
      }
    });
    R.addEventListener("keydown", function (event) {
      if (event.target && event.target.id === "CSI" && event.key === "Enter") send();
    });

    preloadConversation();
    setInterval(poll, POLL_MS);
    if (AUTO_OPEN) setOpen(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);

  return new Response(widgetScript, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
