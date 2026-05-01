import assert from "node:assert/strict";
import { test } from "node:test";

import { createConversationStream } from "./conversation-stream.server.ts";

function message(id: string, body: string, sender = "AI") {
  return {
    id,
    sender,
    kind: "TEXT",
    body,
    metadata: null,
    clientMessageId: id,
    createdAt: "2026-05-01T00:00:00.000Z",
  };
}

async function readEvents(response: Response) {
  const raw = await response.text();
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; text?: string });
}

test("createConversationStream emits ack, visible delta, assistant_done, and done in order", async () => {
  const ack = message("client-1", "Recommend a product", "VISITOR");
  const assistant = message("ai-client-1", "I recommend The Complete Snowboard.");
  const response = createConversationStream({
    conversationId: "conversation-1",
    aiEnabled: true,
    ack,
    shop: "dev-yangchao.myshopify.com",
    visitorId: "visitor-1",
    text: "Recommend a product",
    clientMessageId: "client-1",
    buildProductContext: async () => "Title: The Complete Snowboard",
    streamCustomerService: async ({ onText }) => {
      await onText("I recommend ");
      await onText("The Complete Snowboard.");
      return {
        reply: {
          replyText: "I recommend The Complete Snowboard.",
          recommendedProductIds: ["gid://shopify/Product/1"],
        },
      };
    },
    appendAiReply: async () => [assistant],
    listMessages: async () => [ack, assistant],
    fallbackMessage: () => "AI support is temporarily unavailable.",
  });

  assert.equal(response.headers.get("Content-Type"), "application/x-ndjson; charset=utf-8");
  const events = await readEvents(response);

  assert.deepEqual(
    events.map((event) => event.type),
    ["ack", "assistant_delta", "assistant_delta", "assistant_done", "done"],
  );
  assert.equal(
    events
      .filter((event) => event.type === "assistant_delta")
      .map((event) => event.text)
      .join(""),
    "I recommend The Complete Snowboard.",
  );
});
