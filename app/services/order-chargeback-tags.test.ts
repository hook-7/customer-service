import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkAndTagOrderForPreviousChargeback,
  historicalChargebackOrderQuery,
  normalizeOrderEmail,
  parseChargebackTestEmails,
  PREVIOUS_CHARGEBACK_TAG,
} from "./order-chargeback-tags.ts";
import { orderChargebackTagPayloadFromWebhookPayload } from "./shopify-webhook-payload.server.ts";

function fakeAdmin(
  respond: (query: string, variables: Record<string, unknown>) => unknown,
) {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  return {
    calls,
    admin: {
      async graphql(query: string, options?: { variables?: Record<string, unknown> }) {
        const variables = options?.variables || {};
        calls.push({ query, variables });
        return {
          async json() {
            return respond(query, variables);
          },
        };
      },
    },
  };
}

test("orders/create payload extracts order gid and email", () => {
  assert.deepEqual(
    orderChargebackTagPayloadFromWebhookPayload({
      admin_graphql_api_id: "gid://shopify/Order/123",
      email: "Buyer@Example.com",
    }),
    { orderGid: "gid://shopify/Order/123", email: "Buyer@Example.com" },
  );

  assert.deepEqual(
    orderChargebackTagPayloadFromWebhookPayload({
      id: 456,
      email: "",
      contact_email: "fallback@example.com",
    }),
    { orderGid: "gid://shopify/Order/456", email: "fallback@example.com" },
  );

  assert.equal(orderChargebackTagPayloadFromWebhookPayload({ email: "x@example.com" }), null);
});

test("chargeback email helpers normalize and quote search values", () => {
  assert.equal(normalizeOrderEmail("  Buyer@Example.COM  "), "buyer@example.com");
  assert.equal(normalizeOrderEmail("   "), null);
  assert.equal(normalizeOrderEmail(null), null);
  assert.deepEqual(
    [...parseChargebackTestEmails(" Test@Example.com, second@example.com ,, ")],
    ["test@example.com", "second@example.com"],
  );
  assert.equal(
    historicalChargebackOrderQuery('buyer"name@example.com', "lost"),
    'email:"buyer\\"name@example.com" chargeback_status:lost',
  );
});

test("configured test emails are tagged without historical order lookup", async () => {
  const { admin, calls } = fakeAdmin((query, variables) => {
    assert.ok(query.includes("AddOrderChargebackTag"));
    return {
      data: {
        tagsAdd: {
          node: { id: variables.id },
          userErrors: [],
        },
      },
    };
  });

  const result = await checkAndTagOrderForPreviousChargeback(
    admin,
    {
      orderGid: "gid://shopify/Order/new",
      email: "War7ng@Gmail.com",
    },
    { testEmails: parseChargebackTestEmails("war7ng@gmail.com") },
  );

  assert.deepEqual(result, { tagged: true, matchedStatus: "test_email" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].query.includes("HistoricalChargebackOrders"), false);
  assert.deepEqual(calls[0].variables, {
    id: "gid://shopify/Order/new",
    tags: [PREVIOUS_CHARGEBACK_TAG],
  });
});

test("historical chargeback match adds the previous chargeback tag", async () => {
  const { admin, calls } = fakeAdmin((query, variables) => {
    if (query.includes("HistoricalChargebackOrders")) {
      return {
        data: {
          orders: {
            nodes: String(variables.query).includes("chargeback_status:under_review")
              ? [{ id: "gid://shopify/Order/old" }]
              : [],
          },
        },
      };
    }

    return {
      data: {
        tagsAdd: {
          node: { id: variables.id },
          userErrors: [],
        },
      },
    };
  });

  const result = await checkAndTagOrderForPreviousChargeback(admin, {
    orderGid: "gid://shopify/Order/new",
    email: "Buyer@Example.com",
  });

  assert.deepEqual(result, { tagged: true, matchedStatus: "under_review" });
  assert.ok(
    calls.some((call) =>
      String(call.variables.query).includes('email:"buyer@example.com" chargeback_status:under_review'),
    ),
  );
  const tagCall = calls.find((call) => call.query.includes("AddOrderChargebackTag"));
  assert.deepEqual(tagCall?.variables, {
    id: "gid://shopify/Order/new",
    tags: [PREVIOUS_CHARGEBACK_TAG],
  });
});

test("orders without historical chargebacks are not tagged", async () => {
  const { admin, calls } = fakeAdmin((query) => {
    assert.ok(query.includes("HistoricalChargebackOrders"));
    return { data: { orders: { nodes: [] } } };
  });

  const result = await checkAndTagOrderForPreviousChargeback(admin, {
    orderGid: "gid://shopify/Order/new",
    email: "buyer@example.com",
  });

  assert.deepEqual(result, { tagged: false, reason: "no_chargeback_history" });
  assert.equal(calls.some((call) => call.query.includes("AddOrderChargebackTag")), false);
});

test("orders without email skip chargeback lookup without retryable errors", async () => {
  const { admin, calls } = fakeAdmin(() => {
    throw new Error("GraphQL should not be called without an email.");
  });

  const result = await checkAndTagOrderForPreviousChargeback(admin, {
    orderGid: "gid://shopify/Order/new",
    email: null,
  });

  assert.deepEqual(result, { tagged: false, reason: "missing_email" });
  assert.equal(calls.length, 0);
});
