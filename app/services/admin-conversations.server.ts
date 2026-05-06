export type ConversationStatusFilter = "PENDING" | "HANDLED" | "ALL";
export type AiStatusFilter = "on" | "off" | "all";

export function normalizeTagLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 32);
}

export function parseConversationStatus(value: string | null): ConversationStatusFilter {
  if (value === "PENDING" || value === "HANDLED") return value;
  return "ALL";
}

export function parseAiFilter(value: string | null): AiStatusFilter {
  if (value === "on" || value === "off") return value;
  return "all";
}
