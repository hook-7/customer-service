import { createHash } from "node:crypto";

import {
  extractPartialReplyText,
  parseAiReply,
  type AiReplyEnvelope,
} from "./ai-reply.server.ts";

export { parseAiReply } from "./ai-reply.server.ts";
export type { AiReplyEnvelope } from "./ai-reply.server.ts";

type AiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

type OpenAiResponseContent = {
  type?: string;
  text?: string;
};

type OpenAiOutputItem = {
  type?: string;
  role?: string;
  content?: OpenAiResponseContent[];
};

type OpenAiResponse = {
  output_text?: string;
  output?: OpenAiOutputItem[];
};

export type AiCustomerServiceResult = {
  reply: AiReplyEnvelope | null;
  error?: string;
};

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    replyText: { type: "string" },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          productId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["productId", "reason"],
      },
    },
  },
  required: ["replyText", "recommendations"],
};

function getAiConfig(): AiConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || "60000");
  return {
    apiKey,
    baseUrl: (
      process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1"
    ).replace(/\/+$/, ""),
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna",
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 60000,
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

function safetyIdentifier(shop: string, visitorId: string) {
  return createHash("sha256").update(`${shop}:${visitorId}`).digest("hex");
}

function customerServiceInstructions() {
  return [
    "You are an AI customer service agent for a Shopify storefront.",
    "Answer clearly, concisely, and in the same language as the customer.",
    "Use only the supplied product context for product facts and recommendations.",
    "Never invent availability, prices, features, or product IDs.",
    "Recommend only products that directly help with the customer's request.",
    "Return the customer-facing answer in replyText and recommended products in recommendations.",
  ].join("\n");
}

function customerServiceInput(args: {
  shop: string;
  message: string;
  conversationHistory: string;
  productContext: string;
}) {
  return [
    `Shop: ${args.shop}`,
    "Recent conversation:",
    args.conversationHistory || "No previous messages.",
    "Available product context:",
    args.productContext || "No synced products are currently available.",
    "Current customer message:",
    args.message,
  ].join("\n\n");
}

function responseRequestBody(args: {
  cfg: AiConfig;
  shop: string;
  visitorId: string;
  message: string;
  conversationHistory: string;
  productContext: string;
  stream: boolean;
}) {
  return {
    model: args.cfg.model,
    instructions: customerServiceInstructions(),
    input: customerServiceInput(args),
    store: false,
    stream: args.stream,
    safety_identifier: safetyIdentifier(args.shop, args.visitorId),
    reasoning: { effort: "low" },
    max_output_tokens: 1200,
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "customer_service_reply",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  };
}

function extractResponseText(data: OpenAiResponse) {
  if (typeof data.output_text === "string") return data.output_text;

  const chunks: string[] = [];
  for (const item of data.output || []) {
    if (item.type !== "message" && item.role !== "assistant") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("\n").trim();
}

function apiError(status: number, raw: string) {
  try {
    const data = JSON.parse(raw) as { error?: { message?: unknown } };
    if (typeof data.error?.message === "string") {
      return `OpenAI API returned ${status}: ${data.error.message.slice(0, 500)}`;
    }
  } catch {
    // Use the sanitized fallback below.
  }
  return `OpenAI API returned ${status}.`;
}

function requestError(error: unknown, timeoutMs: number) {
  if (error instanceof Error && error.name === "AbortError") {
    return `OpenAI request timed out after ${timeoutMs}ms`;
  }
  return error instanceof Error ? error.message : String(error);
}

function extractSseBlocks(buffer: string) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  return { complete: blocks.slice(0, -1), rest: blocks.at(-1) || "" };
}

function parseSseBlock(block: string) {
  const dataText = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!dataText || dataText === "[DONE]") return {};

  const data = JSON.parse(dataText) as {
    type?: string;
    delta?: unknown;
    error?: { message?: unknown };
    response?: { error?: { message?: unknown } };
  };
  if (
    data.type === "response.output_text.delta" &&
    typeof data.delta === "string"
  ) {
    return { delta: data.delta };
  }
  if (data.type === "response.failed" || data.type === "error") {
    const message = data.response?.error?.message || data.error?.message;
    return {
      error:
        typeof message === "string"
          ? message
          : "OpenAI streaming response failed.",
    };
  }
  return {};
}

export async function askAiCustomerService(args: {
  shop: string;
  visitorId: string;
  message: string;
  conversationHistory: string;
  productContext: string;
}): Promise<AiCustomerServiceResult> {
  const cfg = getAiConfig();
  if (!cfg) return { reply: null, error: "OPENAI_API_KEY is not configured." };

  const { signal, clear } = withTimeout(cfg.timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        responseRequestBody({ ...args, cfg, stream: false }),
      ),
      signal,
    });
    const raw = await response.text();
    if (!response.ok)
      return { reply: null, error: apiError(response.status, raw) };

    const text = extractResponseText(JSON.parse(raw) as OpenAiResponse);
    return text
      ? { reply: parseAiReply(text) }
      : { reply: null, error: "OpenAI API returned an empty response." };
  } catch (error) {
    return { reply: null, error: requestError(error, cfg.timeoutMs) };
  } finally {
    clear();
  }
}

export async function streamAiCustomerService(args: {
  shop: string;
  visitorId: string;
  message: string;
  conversationHistory: string;
  productContext: string;
  onText: (text: string) => Promise<void> | void;
}): Promise<AiCustomerServiceResult> {
  const cfg = getAiConfig();
  if (!cfg) return { reply: null, error: "OPENAI_API_KEY is not configured." };

  const { signal, clear } = withTimeout(cfg.timeoutMs);
  try {
    const response = await fetch(`${cfg.baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(responseRequestBody({ ...args, cfg, stream: true })),
      signal,
    });
    if (!response.ok || !response.body) {
      const raw = await response.text();
      return { reply: null, error: apiError(response.status, raw) };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let visibleText = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = extractSseBlocks(buffer);
      buffer = blocks.rest;

      for (const block of blocks.complete) {
        const event = parseSseBlock(block);
        if (event.error) return { reply: null, error: event.error };
        if (!event.delta) continue;
        fullText += event.delta;
        const nextVisible = extractPartialReplyText(fullText);
        if (nextVisible.length > visibleText.length) {
          const delta = nextVisible.slice(visibleText.length);
          visibleText = nextVisible;
          await args.onText(delta);
        }
      }
    }

    return fullText
      ? { reply: parseAiReply(fullText.trim()) }
      : { reply: null, error: "OpenAI API returned an empty stream." };
  } catch (error) {
    return { reply: null, error: requestError(error, cfg.timeoutMs) };
  } finally {
    clear();
  }
}
