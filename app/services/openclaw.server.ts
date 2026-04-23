type OpenClawRole = "system" | "user" | "assistant";

export type OpenClawChatMessage = {
  role: OpenClawRole;
  content: string;
};

export type OpenClawConfig = {
  baseUrl: string;
  token: string;
  model: string;
  timeoutMs: number;
};

function getConfig(): OpenClawConfig | null {
  const baseUrl = process.env.OPENCLAW_BASE_URL?.trim();
  const token = process.env.OPENCLAW_TOKEN?.trim();
  const model = process.env.OPENCLAW_MODEL?.trim() || "gpt-4.1-mini";
  const timeoutMs = Number(process.env.OPENCLAW_TIMEOUT_MS || "8000");

  if (!baseUrl || !token) return null;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token,
    model,
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 8000,
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

/**
 * OpenClaw Gateway 提供 OpenAI 兼容接口：
 * POST {baseUrl}/v1/chat/completions
 */
export async function openclawChatComplete(
  messages: OpenClawChatMessage[],
): Promise<string | null> {
  const cfg = getConfig();
  if (!cfg) return null;

  const { signal, clear } = withTimeout(cfg.timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.2,
      }),
      signal,
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const text = content.trim();
    return text.length ? text : null;
  } catch {
    return null;
  } finally {
    clear();
  }
}

