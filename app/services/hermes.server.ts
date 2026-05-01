import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type HermesResponseContent = {
  type?: string;
  text?: string;
};

type HermesOutputItem = {
  type?: string;
  role?: string;
  content?: HermesResponseContent[];
};

type HermesResponse = {
  output_text?: string;
  output?: HermesOutputItem[];
};

export type HermesReplyEnvelope = {
  replyText: string;
  recommendedProductIds: string[];
  recommendationReasons?: Record<string, string>;
};

type HermesConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

type HermesPostResult = {
  ok: boolean;
  text: string;
  error?: string;
};

export type HermesCustomerServiceResult = {
  reply: HermesReplyEnvelope | null;
  error?: string;
};

let envFileCache: Record<string, string> | null = null;
const conversationResets = new Map<string, string>();

function readLocalEnv(name: string) {
  if (!envFileCache) {
    envFileCache = {};
    const candidates = [
      resolve(process.cwd(), ".env"),
      process.env.INIT_CWD ? resolve(process.env.INIT_CWD, ".env") : "",
      resolve(process.cwd(), "..", ".env"),
      resolve(process.cwd(), "..", "..", ".env"),
    ].filter(Boolean);

    for (const path of candidates) {
      try {
        const raw = readFileSync(path, "utf8");
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const index = trimmed.indexOf("=");
          if (index <= 0) continue;
          envFileCache[trimmed.slice(0, index)] = trimmed.slice(index + 1);
        }
        envFileCache.__ENV_FILE_PATH = path;
        break;
      } catch {
        // Try the next possible app root.
      }
    }
  }
  return envFileCache[name];
}

function env(name: string) {
  return process.env[name]?.trim() || readLocalEnv(name)?.trim();
}

function getConfig(): HermesConfig | null {
  const apiHost = env("API_SERVER_HOST") || "127.0.0.1";
  const apiPort = env("API_SERVER_PORT") || "8642";
  const defaultBaseUrl = `http://${apiHost}:${apiPort}/v1`;
  const enabled = env("API_SERVER_ENABLED");
  const baseUrl = env("HERMES_BASE_URL") || defaultBaseUrl;
  const apiKey = env("HERMES_API_KEY") || env("API_SERVER_KEY");
  const model = env("HERMES_MODEL") || env("API_SERVER_MODEL_NAME") || "hermes-agent";
  const timeoutMs = Number(
    env("HERMES_TIMEOUT_MS") || env("API_SERVER_TIMEOUT_MS") || "15000",
  );

  if (enabled === "false" || !apiKey) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 15000,
  };
}

function envDebug() {
  return {
    cwd: process.cwd(),
    envFile: readLocalEnv("__ENV_FILE_PATH") || "not found",
    hasApiServerKey: Boolean(env("API_SERVER_KEY")),
    hasHermesApiKey: Boolean(env("HERMES_API_KEY")),
    host: env("API_SERVER_HOST") || "127.0.0.1",
    port: env("API_SERVER_PORT") || "8642",
    enabled: env("API_SERVER_ENABLED") || "unset",
  };
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function cleanKeyPart(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function conversationKey(...parts: string[]) {
  return parts.map(cleanKeyPart).filter(Boolean).join("-");
}

function customerConversationKey(shop: string, visitorId: string) {
  return conversationKey("customer-service", shop, visitorId);
}

function activeConversationKey(base: string) {
  return conversationResets.get(base) || base;
}

function shouldResetConversation(error?: string) {
  const lower = error?.toLowerCase() || "";
  return Boolean(
    error &&
      (error.includes("Previous response not found") ||
        error.includes("invalid_request_error") ||
        lower.includes("aborted") ||
        lower.includes("aborterror") ||
        lower.includes("timeout") ||
        lower.includes("timed out")),
  );
}

function resetConversation(base: string) {
  const next = conversationKey(base, "reset", String(Date.now()));
  conversationResets.set(base, next);
  console.warn("[Hermes conversation reset]", { base, next });
  return next;
}

function extractText(data: HermesResponse) {
  if (typeof data.output_text === "string") return data.output_text;

  const chunks: string[] = [];
  for (const item of data.output || []) {
    if (item.type !== "message" && item.role !== "assistant") continue;
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function extractSseDataBlocks(buffer: string) {
  const blocks = buffer.split(/\n\n/);
  return {
    complete: blocks.slice(0, -1),
    rest: blocks[blocks.length - 1] || "",
  };
}

function parseSseDelta(block: string) {
  const dataLine = block
    .split(/\n/)
    .find((line) => line.startsWith("data: "));
  if (!dataLine) return "";

  try {
    const data = JSON.parse(dataLine.slice(6)) as { type?: string; delta?: unknown };
    return data.type === "response.output_text.delta" &&
      typeof data.delta === "string"
      ? data.delta
      : "";
  } catch {
    return "";
  }
}

function extractPartialReplyText(text: string) {
  const raw = stripCodeFence(text);
  const key = raw.indexOf('"replyText"');
  if (key < 0) {
    const trimmed = raw.trimStart();
    return trimmed.startsWith("{") || trimmed.startsWith('"') ? "" : raw;
  }

  const colon = raw.indexOf(":", key);
  if (colon < 0) return "";
  const firstQuote = raw.indexOf('"', colon + 1);
  if (firstQuote < 0) return "";

  let value = "";
  let escaped = false;
  for (let i = firstQuote + 1; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      if (ch === "n") value += "\n";
      else if (ch === "t") value += "\t";
      else value += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') break;
    value += ch;
  }
  return value;
}

function stripCodeFence(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export function parseHermesReply(text: string): HermesReplyEnvelope {
  const fallback = {
    replyText: text.trim(),
    recommendedProductIds: [],
  };

  try {
    const parsed = JSON.parse(stripCodeFence(text)) as Partial<HermesReplyEnvelope>;
    const replyText =
      typeof parsed.replyText === "string" && parsed.replyText.trim().length
        ? parsed.replyText.trim()
        : fallback.replyText;
    const recommendedProductIds = Array.isArray(parsed.recommendedProductIds)
      ? parsed.recommendedProductIds.filter((id): id is string => typeof id === "string")
      : [];
    const recommendationReasons =
      parsed.recommendationReasons &&
      typeof parsed.recommendationReasons === "object" &&
      !Array.isArray(parsed.recommendationReasons)
        ? parsed.recommendationReasons
        : undefined;

    return { replyText, recommendedProductIds, recommendationReasons };
  } catch {
    return fallback;
  }
}

async function postResponses(
  input: string,
  conversation: string,
  instructions?: string,
  timeoutMs?: number,
): Promise<HermesPostResult> {
  const cfg = getConfig();
  if (!cfg) {
    return {
      ok: false,
      text: "",
      error: `Hermes API is not configured: ${JSON.stringify(envDebug())}`,
    };
  }

  const { signal, clear } = withTimeout(timeoutMs || cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        conversation,
        input,
        instructions,
        store: true,
      }),
      signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        text: "",
        error: `Hermes API returned ${res.status}: ${raw.slice(0, 500)}`,
      };
    }

    let text = "";
    try {
      text = extractText(JSON.parse(raw) as HermesResponse);
    } catch {
      text = raw;
    }
    return { ok: true, text };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Hermes request timed out after ${timeoutMs || cfg.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, text: "", error: message };
  } finally {
    clear();
  }
}

async function streamResponses(args: {
  input: string;
  conversation: string;
  instructions?: string;
  onText: (text: string) => Promise<void> | void;
  timeoutMs?: number;
}): Promise<HermesPostResult> {
  const cfg = getConfig();
  if (!cfg) {
    return {
      ok: false,
      text: "",
      error: `Hermes API is not configured: ${JSON.stringify(envDebug())}`,
    };
  }

  const { signal, clear } = withTimeout(args.timeoutMs || cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        conversation: args.conversation,
        input: args.input,
        instructions: args.instructions,
        store: true,
        stream: true,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      const raw = await res.text();
      return {
        ok: false,
        text: "",
        error: `Hermes stream returned ${res.status}: ${raw.slice(0, 500)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    let fullText = "";
    let visibleText = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const blocks = extractSseDataBlocks(sseBuffer);
      sseBuffer = blocks.rest;

      for (const block of blocks.complete) {
        const delta = parseSseDelta(block);
        if (!delta) continue;
        fullText += delta;
        const nextVisible = extractPartialReplyText(fullText);
        if (nextVisible.length > visibleText.length) {
          const diff = nextVisible.slice(visibleText.length);
          visibleText = nextVisible;
          await args.onText(diff);
        }
      }
    }

    return { ok: true, text: fullText.trim() };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Hermes stream timed out after ${args.timeoutMs || cfg.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error);
    return { ok: false, text: "", error: message };
  } finally {
    clear();
  }
}

export async function askHermesCustomerService(args: {
  shop: string;
  visitorId: string;
  message: string;
  productContext: string;
}): Promise<HermesCustomerServiceResult> {
  const instructions = [
    "You are an AI customer service agent for a Shopify storefront.",
    "Answer product questions clearly and concisely.",
    "Use only the provided product context when recommending products.",
    "Return only JSON with this shape:",
    '{"replyText":"string","recommendedProductIds":["gid://shopify/Product/..."],"recommendationReasons":{"gid://shopify/Product/...":"short reason"}}',
    "If no product should be recommended, return an empty recommendedProductIds array.",
  ].join("\n");

  const input = [
    `Shop: ${args.shop}`,
    "Available product context:",
    args.productContext || "No synced products are currently available.",
    "Customer message:",
    args.message,
  ].join("\n\n");

  const baseConversation = customerConversationKey(args.shop, args.visitorId);
  let conversation = activeConversationKey(baseConversation);
  let result = await postResponses(input, conversation, instructions, 60000);
  if (!result.ok && shouldResetConversation(result.error)) {
    conversation = resetConversation(baseConversation);
    result = await postResponses(input, conversation, instructions, 60000);
  }
  if (!result.ok) {
    console.error("[Hermes customer service failed]", {
      shop: args.shop,
      visitorId: args.visitorId,
      error: result.error,
    });
  }
  return {
    reply: result.ok && result.text ? parseHermesReply(result.text) : null,
    error: result.ok ? undefined : result.error,
  };
}

export async function streamHermesCustomerService(args: {
  shop: string;
  visitorId: string;
  message: string;
  productContext: string;
  onText: (text: string) => Promise<void> | void;
}): Promise<HermesCustomerServiceResult> {
  const instructions = [
    "You are an AI customer service agent for a Shopify storefront.",
    "Answer product questions clearly and concisely.",
    "Use only the provided product context when recommending products.",
    "Return only JSON with this shape:",
    '{"replyText":"string","recommendedProductIds":["gid://shopify/Product/..."],"recommendationReasons":{"gid://shopify/Product/...":"short reason"}}',
    "If no product should be recommended, return an empty recommendedProductIds array.",
  ].join("\n");

  const input = [
    `Shop: ${args.shop}`,
    "Available product context:",
    args.productContext || "No synced products are currently available.",
    "Customer message:",
    args.message,
  ].join("\n\n");

  const baseConversation = customerConversationKey(args.shop, args.visitorId);
  let conversation = activeConversationKey(baseConversation);
  let result = await streamResponses({
    input,
    conversation,
    instructions,
    onText: args.onText,
    timeoutMs: 60000,
  });
  if (!result.ok && shouldResetConversation(result.error)) {
    conversation = resetConversation(baseConversation);
    result = await streamResponses({
      input,
      conversation,
      instructions,
      onText: args.onText,
      timeoutMs: 60000,
    });
  }
  if (!result.ok) {
    console.error("[Hermes customer service stream failed]", {
      shop: args.shop,
      visitorId: args.visitorId,
      error: result.error,
    });
  }
  return {
    reply: result.ok && result.text ? parseHermesReply(result.text) : null,
    error: result.ok ? undefined : result.error,
  };
}

export async function pushProductKnowledgeToHermes(args: {
  shop: string;
  action: "UPSERT_PRODUCT" | "DELETE_PRODUCT";
  payload: {
    productGid?: string;
    title?: string;
    description?: string | null;
    handle?: string;
    productUrl?: string | null;
    price?: string | null;
    currencyCode?: string | null;
    available?: boolean;
    published?: boolean;
    sourceUpdatedAt?: Date | string | null;
  };
}) {
  const instructions = [
    "Store this Shopify product knowledge for future customer service recommendations.",
    "Acknowledge with a short plain-text confirmation only.",
  ].join("\n");
  const product = {
    productGid: args.payload.productGid,
    title: args.payload.title,
    description: args.payload.description?.slice(0, 700) || null,
    handle: args.payload.handle,
    productUrl: args.payload.productUrl,
    price: args.payload.price,
    currencyCode: args.payload.currencyCode,
    available: args.payload.available,
    published: args.payload.published,
    sourceUpdatedAt: args.payload.sourceUpdatedAt,
  };
  const input = JSON.stringify({ action: args.action, shop: args.shop, product });
  const productKey = args.payload.productGid || args.payload.handle || args.payload.title || "unknown";
  const baseConversation = conversationKey("product-knowledge", args.shop, productKey);

  let conversation = activeConversationKey(baseConversation);
  let result = await postResponses(
    input,
    conversation,
    instructions,
    Number(env("HERMES_PRODUCT_SYNC_TIMEOUT_MS") || "15000"),
  );
  if (!result.ok && shouldResetConversation(result.error)) {
    conversation = resetConversation(baseConversation);
    result = await postResponses(
      input,
      conversation,
      instructions,
      Number(env("HERMES_PRODUCT_SYNC_TIMEOUT_MS") || "15000"),
    );
  }
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
}
