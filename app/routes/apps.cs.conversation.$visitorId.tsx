import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

import {
  appendMessage,
  getOrCreateConversation,
  isValidClientMessageId,
  isValidVisitorId,
  listMessagesForConversation,
  serializeMessage,
} from "../models/chat.server";
import {
  buildProductContext,
  getRecommendedProductCards,
} from "../models/products.server";
import { authenticate } from "../shopify.server";
import {
  askHermesCustomerService,
  streamHermesCustomerService,
} from "../services/hermes.server";
import { checkChatRateLimit } from "../services/chat-rate-limit.server";
import { createConversationStream } from "../services/conversation-stream.server";

const MAX_BODY = 2000;
const AI_FALLBACK_MESSAGE =
  "AI support is temporarily unavailable. Please try again or wait for staff.";

function fallbackMessage(error?: string) {
  if (error) return AI_FALLBACK_MESSAGE;
  return AI_FALLBACK_MESSAGE;
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });
}

async function getShopFromProxy(request: Request) {
  await authenticate.public.appProxy(request);
  const shop = new URL(request.url).searchParams.get("shop");
  if (!shop) {
    throw new Response("Bad Request", { status: 400 });
  }
  return shop;
}

async function appendAiReply(args: {
  conversationId: string;
  shop: string;
  requestClientMessageId: string;
  reply:
    | {
        replyText: string;
        recommendedProductIds: string[];
        recommendationReasons?: Record<string, string>;
      }
    | null;
  error?: string;
}) {
  const replyText = args.reply?.replyText?.trim() || fallbackMessage(args.error);
  const messages = [];
  const textMessage = await appendMessage(
    args.conversationId,
    "AI",
    replyText.slice(0, MAX_BODY),
    "TEXT",
    undefined,
    {
      status: args.reply ? "HANDLED" : "PENDING",
      clientMessageId: `ai-${args.requestClientMessageId}`,
    },
  );
  messages.push(textMessage);

  if (!args.reply) return messages;

  const cards = await getRecommendedProductCards(
    args.shop,
    args.reply.recommendedProductIds || [],
    args.reply.recommendationReasons,
  );
  if (cards.length) {
    const productMessage = await appendMessage(
      args.conversationId,
      "AI",
      "Recommended products",
      "PRODUCT_RECOMMENDATION",
      { products: cards },
      { clientMessageId: `ai-products-${args.requestClientMessageId}` },
    );
    messages.push(productMessage);
  }

  return messages;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const visitorId = params.visitorId ?? "";
  if (!isValidVisitorId(visitorId)) {
    return json({ error: "invalid_visitor" }, { status: 400 });
  }

  const shop = await getShopFromProxy(request);
  const conversation = await getOrCreateConversation(shop, visitorId);
  const messages = await listMessagesForConversation(conversation.id);

  return json({
    conversationId: conversation.id,
    aiEnabled: conversation.aiEnabled,
    messages: messages.map(serializeMessage),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const visitorId = params.visitorId ?? "";
  if (!isValidVisitorId(visitorId)) {
    return json({ error: "invalid_visitor" }, { status: 400 });
  }

  const shop = await getShopFromProxy(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { body?: unknown }).body !== "string" ||
    typeof (body as { clientMessageId?: unknown }).clientMessageId !== "string"
  ) {
    return json({ error: "expected_body_field" }, { status: 400 });
  }

  const text = (body as { body: string }).body.trim();
  const clientMessageId = (body as { clientMessageId: string }).clientMessageId;
  if (!text.length) {
    return json({ error: "empty_message" }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return json({ error: "message_too_long" }, { status: 400 });
  }
  if (!isValidClientMessageId(clientMessageId)) {
    return json({ error: "invalid_client_message_id" }, { status: 400 });
  }

  const rateLimit = await checkChatRateLimit(shop, visitorId);
  if (!rateLimit.allowed) {
    return json(
      { error: "rate_limited", retryAfterSeconds: rateLimit.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const conversation = await getOrCreateConversation(shop, visitorId);
  const userMessage = await appendMessage(
    conversation.id,
    "VISITOR",
    text,
    "TEXT",
    undefined,
    { clientMessageId },
  );
  const ack = serializeMessage(userMessage);

  if (new URL(request.url).searchParams.get("stream") === "1") {
    return createConversationStream({
      conversationId: conversation.id,
      aiEnabled: conversation.aiEnabled,
      ack,
      shop,
      visitorId,
      text,
      clientMessageId,
      buildProductContext: () => buildProductContext(shop),
      streamCustomerService: streamHermesCustomerService,
      appendAiReply: async (args) =>
        (await appendAiReply(args)).map(serializeMessage),
      listMessages: async () =>
        (await listMessagesForConversation(conversation.id)).map(serializeMessage),
      fallbackMessage,
    });
  }

  if (conversation.aiEnabled) {
    const result = await askHermesCustomerService({
      shop,
      visitorId,
      message: text,
      productContext: await buildProductContext(shop),
    });
    await appendAiReply({
      conversationId: conversation.id,
      shop,
      requestClientMessageId: clientMessageId,
      reply: result.reply,
      error: result.error,
    });
  }

  const messages = await listMessagesForConversation(conversation.id);

  return json({
    ok: true,
    conversationId: conversation.id,
    aiEnabled: conversation.aiEnabled,
    ack,
    messages: messages.map(serializeMessage),
  });
};
