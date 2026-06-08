import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adminOrderGidFromLegacyId,
  buildFatherDayCardRecord,
  legacyOrderIdFromGid,
  normalizeShopDomain,
  saveFatherDayCardSubmission,
  validateFatherDayCardSubmission,
} from "./fathers-day-card.server.ts";

const validSubmission = {
  orderId: "gid://shopify/Order/1234567890",
  orderNumber: "1001",
  checkoutToken: "checkout-token-1",
  fatherName: "  Dad   Smith  ",
  message: "  Happy   Father's   Day!  ",
  fatherEmail: "  DAD@example.COM ",
  customerId: "gid://shopify/Customer/9876543210",
  customerEmail: "  BUYER@example.COM ",
  customerName: "  Yang   Chao ",
};

test("validateFatherDayCardSubmission normalizes valid card details", () => {
  const result = validateFatherDayCardSubmission({
    ...validSubmission,
    orderId: "gid://shopify/OrderIdentity/1234567890",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected valid card details");

  assert.deepEqual(result.value, {
    orderId: "gid://shopify/Order/1234567890",
    orderNumber: "1001",
    checkoutToken: "checkout-token-1",
    fatherName: "Dad Smith",
    message: "Happy Father's Day!",
    fatherEmail: "dad@example.com",
    customerId: "gid://shopify/Customer/9876543210",
    customerEmail: "buyer@example.com",
    customerName: "Yang Chao",
  });
});

test("validateFatherDayCardSubmission rejects missing or malformed fields", () => {
  assert.deepEqual(validateFatherDayCardSubmission(null), {
    ok: false,
    error: "invalid_body",
  });
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      orderId: "1234567890",
    }),
    { ok: false, error: "invalid_order_id", field: "orderId" },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      fatherName: "x".repeat(81),
    }),
    {
      ok: false,
      error: "father_name_too_long",
      field: "fatherName",
    },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      message: "x".repeat(301),
    }),
    {
      ok: false,
      error: "message_too_long",
      field: "message",
    },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      fatherEmail: "not-an-email",
    }),
    {
      ok: false,
      error: "father_email_invalid",
      field: "fatherEmail",
    },
  );
});

test("order and shop helpers normalize Shopify identifiers", () => {
  assert.equal(legacyOrderIdFromGid("gid://shopify/Order/1234567890"), "1234567890");
  assert.equal(
    legacyOrderIdFromGid("gid://shopify/OrderIdentity/1234567890"),
    "1234567890",
  );
  assert.equal(legacyOrderIdFromGid("gid://shopify/Product/1234567890"), null);
  assert.equal(
    adminOrderGidFromLegacyId("1234567890"),
    "gid://shopify/Order/1234567890",
  );
  assert.equal(normalizeShopDomain("https://Dev-YangChao.myshopify.com/admin"), "dev-yangchao.myshopify.com");
  assert.equal(normalizeShopDomain("dev-yangchao.myshopify.com"), "dev-yangchao.myshopify.com");
  assert.equal(normalizeShopDomain("   "), null);
});

test("buildFatherDayCardRecord stores stable database payload", () => {
  const result = validateFatherDayCardSubmission(validSubmission);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected valid card details");

  assert.deepEqual(
    buildFatherDayCardRecord({
      shop: "dev-yangchao.myshopify.com",
      submission: result.value,
    }),
    {
      shop: "dev-yangchao.myshopify.com",
      orderId: "gid://shopify/Order/1234567890",
      orderLegacyId: "1234567890",
      orderNumber: "1001",
      checkoutToken: "checkout-token-1",
      fatherName: "Dad Smith",
      message: "Happy Father's Day!",
      fatherEmail: "dad@example.com",
      customerId: "gid://shopify/Customer/9876543210",
      customerEmail: "buyer@example.com",
      customerName: "Yang Chao",
      source: "thank_you_extension",
    },
  );
});

test("saveFatherDayCardSubmission upserts by shop and order", async () => {
  const result = validateFatherDayCardSubmission(validSubmission);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected valid card details");

  let upsertArgs: unknown;
  const db = {
    fatherDayCard: {
      async upsert(args: unknown) {
        upsertArgs = args;
        return { id: "card-1" };
      },
    },
  };

  await saveFatherDayCardSubmission({
    db,
    shop: "dev-yangchao.myshopify.com",
    submission: result.value,
  });

  assert.deepEqual(upsertArgs, {
    where: {
      shop_orderId: {
        shop: "dev-yangchao.myshopify.com",
        orderId: "gid://shopify/Order/1234567890",
      },
    },
    create: {
      shop: "dev-yangchao.myshopify.com",
      orderId: "gid://shopify/Order/1234567890",
      orderLegacyId: "1234567890",
      orderNumber: "1001",
      checkoutToken: "checkout-token-1",
      fatherName: "Dad Smith",
      message: "Happy Father's Day!",
      fatherEmail: "dad@example.com",
      customerId: "gid://shopify/Customer/9876543210",
      customerEmail: "buyer@example.com",
      customerName: "Yang Chao",
      source: "thank_you_extension",
    },
    update: {
      orderLegacyId: "1234567890",
      orderNumber: "1001",
      checkoutToken: "checkout-token-1",
      fatherName: "Dad Smith",
      message: "Happy Father's Day!",
      fatherEmail: "dad@example.com",
      customerId: "gid://shopify/Customer/9876543210",
      customerEmail: "buyer@example.com",
      customerName: "Yang Chao",
      source: "thank_you_extension",
    },
  });
});
