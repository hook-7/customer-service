export type AiReplyEnvelope = {
  replyText: string;
  recommendedProductIds: string[];
  recommendationReasons?: Record<string, string>;
};

type StructuredAiReply = {
  replyText?: unknown;
  recommendations?: unknown;
};

function stripCodeFence(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

export function extractPartialReplyText(text: string) {
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

export function parseAiReply(text: string): AiReplyEnvelope {
  const fallback = {
    replyText: text.trim(),
    recommendedProductIds: [],
  };

  try {
    const parsed = JSON.parse(stripCodeFence(text)) as StructuredAiReply;
    const replyText =
      typeof parsed.replyText === "string" && parsed.replyText.trim()
        ? parsed.replyText.trim()
        : fallback.replyText;
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations
      : [];
    const recommendedProductIds: string[] = [];
    const recommendationReasons: Record<string, string> = {};

    for (const recommendation of recommendations) {
      if (!recommendation || typeof recommendation !== "object") continue;
      const productId = (recommendation as { productId?: unknown }).productId;
      const reason = (recommendation as { reason?: unknown }).reason;
      if (typeof productId !== "string" || !productId) continue;
      recommendedProductIds.push(productId);
      if (typeof reason === "string" && reason.trim()) {
        recommendationReasons[productId] = reason.trim();
      }
    }

    return {
      replyText,
      recommendedProductIds,
      recommendationReasons:
        Object.keys(recommendationReasons).length > 0
          ? recommendationReasons
          : undefined,
    };
  } catch {
    return fallback;
  }
}
