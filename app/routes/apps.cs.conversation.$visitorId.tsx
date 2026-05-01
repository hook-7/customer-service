import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

import {
  appendMessage,
  getOrCreateConversation,
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

const MAX_BODY = 2000;
const AI_FALLBACK_MESSAGE = "AI support did not return. Please try again.";

function fallbackMessage(error?: string) {
  return error
    ? `${AI_FALLBACK_MESSAGE} Reason: ${error.slice(0, 300)}`
    : AI_FALLBACK_MESSAGE;
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
  await appendMessage(args.conversationId, "AI", replyText.slice(0, MAX_BODY));

  if (!args.reply) return;

  const cards = await getRecommendedProductCards(
    args.shop,
    args.reply.recommendedProductIds || [],
    args.reply.recommendationReasons,
  );
  if (cards.length) {
    await appendMessage(
      args.conversationId,
      "AI",
      "Recommended products",
      "PRODUCT_RECOMMENDATION",
      { products: cards },
    );
  }
}

function ndjson(data: unknown) {
  return `${JSON.stringify(data)}\n`;
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
    typeof (body as { body?: unknown }).body !== "string"
  ) {
    return json({ error: "expected_body_field" }, { status: 400 });
  }

  const text = (body as { body: string }).body.trim();
  if (!text.length) {
    return json({ error: "empty_message" }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return json({ error: "message_too_long" }, { status: 400 });
  }

  const conversation = await getOrCreateConversation(shop, visitorId);
  await appendMessage(conversation.id, "VISITOR", text);

  if (new URL(request.url).searchParams.get("stream") === "1") {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => controller.enqueue(encoder.encode(ndjson(data)));

        try {
          send({ type: "user_saved" });

          if (conversation.aiEnabled) {
            let streamedAnyText = false;
            const result = await streamHermesCustomerService({
              shop,
              visitorId,
              message: text,
              productContext: await buildProductContext(shop),
              onText: (delta) => {
                streamedAnyText = true;
                send({ type: "delta", text: delta });
              },
            });
            if (!result.reply && !streamedAnyText) {
              send({ type: "delta", text: fallbackMessage(result.error) });
            }
            await appendAiReply({
              conversationId: conversation.id,
              shop,
              reply: result.reply,
              error: result.error,
            });
          }

          const messages = await listMessagesForConversation(conversation.id);
          send({
            type: "done",
            ok: true,
            conversationId: conversation.id,
            aiEnabled: conversation.aiEnabled,
            messages: messages.map(serializeMessage),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          send({ type: "error", error: message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
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
      reply: result.reply,
      error: result.error,
    });
  }

  const messages = await listMessagesForConversation(conversation.id);

  return json({
    ok: true,
    conversationId: conversation.id,
    aiEnabled: conversation.aiEnabled,
    messages: messages.map(serializeMessage),
  });
};
