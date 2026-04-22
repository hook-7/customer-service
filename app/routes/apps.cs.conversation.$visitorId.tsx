import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

import {
  appendMessage,
  getOrCreateConversation,
  isValidVisitorId,
  listMessagesForConversation,
} from "../models/chat.server";
import { authenticate } from "../shopify.server";

const MAX_BODY = 2000;

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

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  const visitorId = params.visitorId ?? "";
  if (!isValidVisitorId(visitorId)) {
    return json({ error: "invalid_visitor" }, { status: 400 });
  }

  const shop = await getShopFromProxy(request);
  const conversation = await getOrCreateConversation(shop, visitorId);
  const messages = await listMessagesForConversation(conversation.id);

  return json({
    conversationId: conversation.id,
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
};

export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
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

  const messages = await listMessagesForConversation(conversation.id);

  return json({
    ok: true,
    conversationId: conversation.id,
    messages: messages.map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
  });
};
