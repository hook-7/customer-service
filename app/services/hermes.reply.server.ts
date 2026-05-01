export type HermesReplyEnvelope = {
  replyText: string;
  recommendedProductIds: string[];
  recommendationReasons?: Record<string, string>;
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
