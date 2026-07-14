import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  askAiCustomerService,
  parseAiReply,
  streamAiCustomerService,
} from "./ai.server.ts";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_BASE_URL = "https://api.openai.test/v1";
  process.env.OPENAI_MODEL = "gpt-5.6-luna";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_MODEL;
});

function sse(type: string, data: Record<string, unknown>) {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
}

test("parseAiReply converts structured recommendations into product cards", () => {
  assert.deepEqual(
    parseAiReply(
      JSON.stringify({
        replyText: "I recommend this helmet.",
        recommendations: [
          { productId: "gid://shopify/Product/1", reason: "Good fit." },
        ],
      }),
    ),
    {
      replyText: "I recommend this helmet.",
      recommendedProductIds: ["gid://shopify/Product/1"],
      recommendationReasons: { "gid://shopify/Product/1": "Good fit." },
    },
  );
});

test("askAiCustomerService calls the OpenAI Responses API without storing responses", async () => {
  let url = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    url = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          replyText: "Hello",
          recommendations: [],
        }),
      }),
      { status: 200 },
    );
  };

  const result = await askAiCustomerService({
    shop: "example.myshopify.com",
    visitorId: "visitor-raw-id",
    message: "Hello",
    conversationHistory: "",
    productContext: "",
  });

  assert.equal(result.reply?.replyText, "Hello");
  assert.equal(url, "https://api.openai.test/v1/responses");
  assert.equal(requestBody.model, "gpt-5.6-luna");
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.stream, false);
  assert.equal(typeof requestBody.safety_identifier, "string");
  assert.notEqual(requestBody.safety_identifier, "visitor-raw-id");
});

test("streamAiCustomerService exposes replyText deltas from OpenAI SSE", async () => {
  const text = JSON.stringify({
    replyText: "I recommend The Complete Snowboard.",
    recommendations: [
      { productId: "gid://shopify/Product/1", reason: "Good all-around fit." },
    ],
  });
  globalThis.fetch = async () =>
    new Response(
      sse("response.output_text.delta", { delta: text.slice(0, 20) }) +
        sse("response.output_text.delta", { delta: text.slice(20) }) +
        sse("response.completed", {}),
      { status: 200 },
    );

  const deltas: string[] = [];
  const result = await streamAiCustomerService({
    shop: "example.myshopify.com",
    visitorId: "visitor-1",
    message: "Recommend a product",
    conversationHistory: "Customer: I need a snowboard.",
    productContext:
      "ID: gid://shopify/Product/1\nTitle: The Complete Snowboard",
    onText: (delta) => {
      deltas.push(delta);
    },
  });

  assert.equal(result.reply?.replyText, "I recommend The Complete Snowboard.");
  assert.equal(deltas.join(""), "I recommend The Complete Snowboard.");
});
