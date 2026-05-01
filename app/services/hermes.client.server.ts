import { getHermesConfig, hermesEnvDebug } from "./hermes.config.server.ts";
import { extractPartialReplyText } from "./hermes.reply.server.ts";

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

export type HermesPostResult = {
  ok: boolean;
  text: string;
  error?: string;
};

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
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

export async function postResponses(
  input: string,
  conversation: string,
  instructions?: string,
  timeoutMs?: number,
): Promise<HermesPostResult> {
  const cfg = getHermesConfig();
  if (!cfg) {
    return {
      ok: false,
      text: "",
      error: `Hermes API is not configured: ${JSON.stringify(hermesEnvDebug())}`,
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

export async function streamResponses(args: {
  input: string;
  conversation: string;
  instructions?: string;
  onText: (text: string) => Promise<void> | void;
  timeoutMs?: number;
}): Promise<HermesPostResult> {
  const cfg = getHermesConfig();
  if (!cfg) {
    return {
      ok: false,
      text: "",
      error: `Hermes API is not configured: ${JSON.stringify(hermesEnvDebug())}`,
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
