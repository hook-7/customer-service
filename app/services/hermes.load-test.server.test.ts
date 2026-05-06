import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  buildHermesLoadTestSummary,
  runHermesLoadTest,
} from "./hermes.load-test.server.ts";

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
});

test("buildHermesLoadTestSummary computes success, error, and latency stats", () => {
  const summary = buildHermesLoadTestSummary([
    { index: 0, ok: true, status: 200, latencyMs: 120, conversation: "conv-a", outputText: "A" },
    {
      index: 1,
      ok: false,
      status: 500,
      latencyMs: 280,
      conversation: "conv-b",
      error: "boom",
    },
    { index: 2, ok: true, status: 200, latencyMs: 200, conversation: "conv-c", outputText: "C" },
  ]);

  assert.deepEqual(summary, {
    total: 3,
    ok: 2,
    failed: 1,
    successRate: 66.67,
    latencyMs: {
      min: 120,
      avg: 200,
      max: 280,
      p95: 280,
    },
  });
});

test("runHermesLoadTest respects the concurrency cap and can share one conversation", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const conversations: string[] = [];

  globalThis.fetch = async (_input, init) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const body = JSON.parse(String(init?.body)) as { conversation: string; input: string };
    conversations.push(body.conversation);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight -= 1;

    return new Response(
      JSON.stringify({
        output_text: `ok:${body.input}`,
      }),
      { status: 200 },
    );
  };

  const report = await runHermesLoadTest({
    input: "hello",
    totalRequests: 5,
    concurrency: 2,
    sharedConversation: true,
    conversationPrefix: "bench",
  });

  assert.equal(report.results.length, 5);
  assert.equal(maxInFlight, 2);
  assert.equal(new Set(conversations).size, 1);
  assert.equal(report.summary.ok, 5);
});

test("runHermesLoadTest can generate unique conversation ids per request", async () => {
  const conversations: string[] = [];

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { conversation: string };
    conversations.push(body.conversation);
    return new Response(JSON.stringify({ output_text: "ok" }), { status: 200 });
  };

  const report = await runHermesLoadTest({
    input: "hello",
    totalRequests: 4,
    concurrency: 4,
    sharedConversation: false,
    conversationPrefix: "bench",
  });

  assert.equal(report.summary.ok, 4);
  assert.equal(new Set(conversations).size, 4);
  assert.ok(conversations.every((conversation) => conversation.startsWith("bench-")));
});
