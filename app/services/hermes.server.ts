import { postResponses, streamResponses } from "./hermes.client.server.ts";
import { env } from "./hermes.config.server.ts";
import { parseHermesReply, type HermesReplyEnvelope } from "./hermes.reply.server.ts";

export { parseHermesReply } from "./hermes.reply.server.ts";
export type { HermesReplyEnvelope } from "./hermes.reply.server.ts";

export type HermesCustomerServiceResult = {
  reply: HermesReplyEnvelope | null;
  error?: string;
};

const conversationResets = new Map<string, string>();

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

function customerServiceInstructions() {
  return [
    "You are an AI customer service agent for a Shopify storefront.",
    "Answer product questions clearly and concisely.",
    "Use only the provided product context when recommending products.",
    "Return only JSON with this shape:",
    '{"replyText":"string","recommendedProductIds":["gid://shopify/Product/..."],"recommendationReasons":{"gid://shopify/Product/...":"short reason"}}',
    "If no product should be recommended, return an empty recommendedProductIds array.",
  ].join("\n");
}

function customerServiceInput(args: {
  shop: string;
  message: string;
  productContext: string;
}) {
  return [
    `Shop: ${args.shop}`,
    "Available product context:",
    args.productContext || "No synced products are currently available.",
    "Customer message:",
    args.message,
  ].join("\n\n");
}

export async function askHermesCustomerService(args: {
  shop: string;
  visitorId: string;
  message: string;
  productContext: string;
}): Promise<HermesCustomerServiceResult> {
  const instructions = customerServiceInstructions();
  const input = customerServiceInput(args);
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
  const instructions = customerServiceInstructions();
  const input = customerServiceInput(args);
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
