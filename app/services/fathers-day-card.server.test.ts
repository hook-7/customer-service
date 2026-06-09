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
  senderName: "  From   Tracy  ",
  recipientRelationship: "  PAPA  ",
  includeFounderLetter: false,
  founderLetterSenderRelationship: "  SON  ",
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
    senderName: "From Tracy",
    recipientRelationship: "papa",
    includeFounderLetter: false,
    founderLetterSenderRelationship: null,
    customerId: "gid://shopify/Customer/9876543210",
    customerEmail: "buyer@example.com",
    customerName: "Yang Chao",
  });
});

test("validateFatherDayCardSubmission accepts founder letter sender relationships", () => {
  for (const relationship of ["son", "daughter", "wife"]) {
    const result = validateFatherDayCardSubmission({
      ...validSubmission,
      includeFounderLetter: true,
      founderLetterSenderRelationship: `  ${relationship.toUpperCase()}  `,
    });

    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("Expected valid card details");

    assert.equal(result.value.includeFounderLetter, true);
    assert.equal(result.value.founderLetterSenderRelationship, relationship);
  }
});

test("validateFatherDayCardSubmission accepts founder letter without a family e-card", () => {
  const result = validateFatherDayCardSubmission({
    ...validSubmission,
    includeCard: false,
    message: "",
    recipientRelationship: "",
    includeFounderLetter: true,
    founderLetterSenderRelationship: "daughter",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected valid founder letter details");

  assert.equal(result.value.message, "");
  assert.equal(result.value.recipientRelationship, "dad");
  assert.equal(result.value.includeFounderLetter, true);
  assert.equal(result.value.founderLetterSenderRelationship, "daughter");
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
      includeCard: false,
      message: "",
      recipientRelationship: "",
      includeFounderLetter: false,
    }),
    {
      ok: false,
      error: "message_option_required",
    },
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
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      senderName: "",
    }),
    {
      ok: false,
      error: "sender_name_required",
      field: "senderName",
    },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      senderName: "x".repeat(81),
    }),
    {
      ok: false,
      error: "sender_name_too_long",
      field: "senderName",
    },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      recipientRelationship: "",
    }),
    {
      ok: false,
      error: "recipient_relationship_required",
      field: "recipientRelationship",
    },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      recipientRelationship: "uncle",
    }),
    {
      ok: false,
      error: "recipient_relationship_invalid",
      field: "recipientRelationship",
    },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      includeFounderLetter: true,
      founderLetterSenderRelationship: "",
    }),
    {
      ok: false,
      error: "founder_letter_sender_relationship_required",
      field: "founderLetterSenderRelationship",
    },
  );
  assert.deepEqual(
    validateFatherDayCardSubmission({
      ...validSubmission,
      includeFounderLetter: true,
      founderLetterSenderRelationship: "brother",
    }),
    {
      ok: false,
      error: "founder_letter_sender_relationship_invalid",
      field: "founderLetterSenderRelationship",
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
      senderName: "From Tracy",
      recipientRelationship: "papa",
      includeFounderLetter: false,
      founderLetterSenderRelationship: null,
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
      senderName: "From Tracy",
      recipientRelationship: "papa",
      includeFounderLetter: false,
      founderLetterSenderRelationship: null,
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
      senderName: "From Tracy",
      recipientRelationship: "papa",
      includeFounderLetter: false,
      founderLetterSenderRelationship: null,
      customerId: "gid://shopify/Customer/9876543210",
      customerEmail: "buyer@example.com",
      customerName: "Yang Chao",
      source: "thank_you_extension",
    },
  });
});
