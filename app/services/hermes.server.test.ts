import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  parseHermesReply,
  pushProductKnowledgeToHermes,
  streamHermesCustomerService,
} from "./hermes.server.ts";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.API_SERVER_ENABLED = "true";
  process.env.API_SERVER_KEY = "test-key";
  process.env.API_SERVER_HOST = "127.0.0.1";
  process.env.API_SERVER_PORT = "8642";
  process.env.API_SERVER_MODEL_NAME = "hermes-agent";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.HERMES_PRODUCT_SYNC_TIMEOUT_MS;
});

function sse(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

test("parseHermesReply accepts JSON, fenced JSON, and plain text", () => {
  assert.deepEqual(parseHermesReply('{"replyText":"Hello","recommendedProductIds":[]}'), {
    replyText: "Hello",
    recommendedProductIds: [],
    recommendationReasons: undefined,
  });

  assert.deepEqual(
    parseHermesReply(
      '```json\n{"replyText":"Pick this","recommendedProductIds":["gid://shopify/Product/1"]}\n```',
    ),
    {
      replyText: "Pick this",
      recommendedProductIds: ["gid://shopify/Product/1"],
      recommendationReasons: undefined,
    },
  );

  assert.deepEqual(parseHermesReply("Plain answer"), {
    replyText: "Plain answer",
    recommendedProductIds: [],
  });
});

test("streamHermesCustomerService streams visible assistant text from SSE", async () => {
  let requestBody: { conversation?: string; stream?: boolean } | undefined;
  const text =
    '{"replyText":"I recommend The Complete Snowboard.","recommendedProductIds":["gid://shopify/Product/1"],"recommendationReasons":{"gid://shopify/Product/1":"Good all-around fit."}}';

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      sse("response.output_text.delta", { delta: text.slice(0, 16) }) +
        sse("response.output_text.delta", { delta: text.slice(16, 48) }) +
        sse("response.output_text.delta", { delta: text.slice(48) }) +
        sse("response.output_text.done", { text }) +
        sse("response.completed", {
          response: {
            output: [
              {
                type: "message",
                role: "assistant",
                content: [{ type: "output_text", text }],
              },
            ],
          },
        }),
      { status: 200 },
    );
  };

  const deltas: string[] = [];
  const result = await streamHermesCustomerService({
    shop: "dev-yangchao.myshopify.com",
    visitorId: "visitor-1",
    message: "Recommend a product",
    productContext: "ID: gid://shopify/Product/1\nTitle: The Complete Snowboard",
    onText: (delta) => {
      deltas.push(delta);
    },
  });

  assert.equal(result.error, undefined);
  assert.equal(result.reply?.replyText, "I recommend The Complete Snowboard.");
  assert.deepEqual(result.reply?.recommendedProductIds, ["gid://shopify/Product/1"]);
  assert.equal(deltas.join(""), "I recommend The Complete Snowboard.");
  assert.equal(requestBody?.stream, true);
  assert.ok(requestBody?.conversation);
  assert.doesNotMatch(requestBody?.conversation || "", /[:.]/);
});

test("pushProductKnowledgeToHermes uses a safe conversation key and parses success", async () => {
  let requestBody: { conversation?: string; input?: string } | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "OK" }],
          },
        ],
      }),
      { status: 200 },
    );
  };

  const result = await pushProductKnowledgeToHermes({
    shop: "dev-yangchao.myshopify.com",
    action: "UPSERT_PRODUCT",
    payload: {
      productGid: "gid://shopify/Product/7724743753793",
      title: "Gift Card",
      handle: "gift-card",
      available: true,
      published: true,
    },
  });

  assert.equal(result.ok, true);
  assert.ok(requestBody?.conversation?.startsWith("product-knowledge-"));
  assert.doesNotMatch(requestBody?.conversation || "", /[:.]/);
  assert.match(requestBody?.input || "", /Gift Card/);
});

test("pushProductKnowledgeToHermes retries with a reset conversation after timeout-like failure", async () => {
  process.env.HERMES_PRODUCT_SYNC_TIMEOUT_MS = "50";
  const conversations: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { conversation: string };
    conversations.push(body.conversation);
    if (conversations.length === 1) {
      return new Response("This operation was aborted", { status: 500 });
    }
    return new Response(JSON.stringify({ output_text: "OK" }), { status: 200 });
  };

  const result = await pushProductKnowledgeToHermes({
    shop: "dev-yangchao.myshopify.com",
    action: "UPSERT_PRODUCT",
    payload: {
      productGid: "gid://shopify/Product/7724743753793",
      title: "Gift Card",
      handle: "gift-card",
      available: true,
      published: true,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(conversations.length, 2);
  assert.notEqual(conversations[0], conversations[1]);
  assert.match(conversations[1], /-reset-/);
  assert.doesNotMatch(conversations[1], /[:.]/);
});
