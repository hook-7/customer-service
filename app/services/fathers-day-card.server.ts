export const FATHERS_DAY_CARD_SOURCE = "thank_you_extension";
export const CARD_NAME_MAX_LENGTH = 80;
export const CARD_EMAIL_MAX_LENGTH = 254;
export const CARD_MESSAGE_MAX_LENGTH = 300;
export const CUSTOMER_ID_MAX_LENGTH = 128;
export const CUSTOMER_NAME_MAX_LENGTH = 200;

export type FatherDayCardSubmission = {
  orderId: string;
  orderNumber: string;
  checkoutToken: string;
  fatherName: string;
  message: string;
  fatherEmail: string;
  customerId: string;
  customerEmail: string;
  customerName: string;
};

export type FatherDayCardRecord = {
  shop: string;
  orderId: string;
  orderLegacyId: string;
  orderNumber: string | null;
  checkoutToken: string;
  fatherName: string;
  message: string;
  fatherEmail: string;
  customerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  source: typeof FATHERS_DAY_CARD_SOURCE;
};

export type ValidationErrorCode =
  | "invalid_body"
  | "invalid_order_id"
  | "missing_checkout_token"
  | "father_name_required"
  | "father_name_too_long"
  | "message_required"
  | "message_too_long"
  | "father_email_required"
  | "father_email_invalid"
  | "father_email_too_long";

export type ValidationResult =
  | { ok: true; value: FatherDayCardSubmission }
  | { ok: false; error: ValidationErrorCode; field?: string };

type FatherDayCardStore = {
  fatherDayCard: {
    upsert(args: {
      where: { shop_orderId: { shop: string; orderId: string } };
      create: FatherDayCardRecord;
      update: Omit<FatherDayCardRecord, "shop" | "orderId">;
    }): Promise<unknown>;
  };
};

function readString(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function readOptionalString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
) {
  return readString(input, key).slice(0, maxLength);
}

function validateField(
  value: string,
  field: "fatherName" | "message" | "fatherEmail",
): ValidationResult | null {
  if (!value) {
    return {
      ok: false,
      error: `${snakeCaseField(field)}_required` as ValidationErrorCode,
      field,
    };
  }

  const maxLength =
    field === "message"
      ? CARD_MESSAGE_MAX_LENGTH
      : field === "fatherEmail"
        ? CARD_EMAIL_MAX_LENGTH
        : CARD_NAME_MAX_LENGTH;
  if (value.length > maxLength) {
    return {
      ok: false,
      error: `${snakeCaseField(field)}_too_long` as ValidationErrorCode,
      field,
    };
  }

  return null;
}

function snakeCaseField(field: "fatherName" | "message" | "fatherEmail") {
  if (field === "fatherName") return "father_name";
  if (field === "fatherEmail") return "father_email";
  return "message";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeOptionalEmail(value: string) {
  const email = value.toLowerCase().slice(0, CARD_EMAIL_MAX_LENGTH);
  return email && isValidEmail(email) ? email : "";
}

export function validateFatherDayCardSubmission(
  body: unknown,
): ValidationResult {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_body" };
  }

  const input = body as Record<string, unknown>;
  const orderId = readString(input, "orderId");
  const orderNumber = readString(input, "orderNumber");
  const checkoutToken = readString(input, "checkoutToken");
  const fatherName = readString(input, "fatherName");
  const message = readString(input, "message");
  const fatherEmail = readString(input, "fatherEmail").toLowerCase();
  const customerId = readOptionalString(input, "customerId", CUSTOMER_ID_MAX_LENGTH);
  const customerEmail = normalizeOptionalEmail(readString(input, "customerEmail"));
  const customerName = readOptionalString(
    input,
    "customerName",
    CUSTOMER_NAME_MAX_LENGTH,
  );
  const legacyOrderId = legacyOrderIdFromGid(orderId);

  if (!legacyOrderId) {
    return { ok: false, error: "invalid_order_id", field: "orderId" };
  }
  if (!checkoutToken) {
    return {
      ok: false,
      error: "missing_checkout_token",
      field: "checkoutToken",
    };
  }

  const fatherNameError = validateField(fatherName, "fatherName");
  if (fatherNameError) return fatherNameError;

  const messageError = validateField(message, "message");
  if (messageError) return messageError;

  const fatherEmailError = validateField(fatherEmail, "fatherEmail");
  if (fatherEmailError) return fatherEmailError;

  if (!isValidEmail(fatherEmail)) {
    return {
      ok: false,
      error: "father_email_invalid",
      field: "fatherEmail",
    };
  }

  return {
    ok: true,
    value: {
      orderId: adminOrderGidFromLegacyId(legacyOrderId),
      orderNumber,
      checkoutToken,
      fatherName,
      message,
      fatherEmail,
      customerId,
      customerEmail,
      customerName,
    },
  };
}

export function legacyOrderIdFromGid(orderId: string) {
  const match = /^gid:\/\/shopify\/(?:Order|OrderIdentity)\/(\d+)$/.exec(
    orderId,
  );
  return match?.[1] ?? null;
}

export function adminOrderGidFromLegacyId(legacyOrderId: string) {
  return `gid://shopify/Order/${legacyOrderId}`;
}

export function normalizeShopDomain(dest: string) {
  const trimmed = dest.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    );
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function buildFatherDayCardRecord(args: {
  shop: string;
  submission: FatherDayCardSubmission;
}): FatherDayCardRecord {
  const orderLegacyId = legacyOrderIdFromGid(args.submission.orderId);
  if (!orderLegacyId) {
    throw new Error("Cannot build card record for invalid order id");
  }

  return {
    shop: args.shop,
    orderId: args.submission.orderId,
    orderLegacyId,
    orderNumber: args.submission.orderNumber || null,
    checkoutToken: args.submission.checkoutToken,
    fatherName: args.submission.fatherName,
    message: args.submission.message,
    fatherEmail: args.submission.fatherEmail,
    customerId: args.submission.customerId || null,
    customerEmail: args.submission.customerEmail || null,
    customerName: args.submission.customerName || null,
    source: FATHERS_DAY_CARD_SOURCE,
  };
}

export async function saveFatherDayCardSubmission(args: {
  db: FatherDayCardStore;
  shop: string;
  submission: FatherDayCardSubmission;
}) {
  const record = buildFatherDayCardRecord({
    shop: args.shop,
    submission: args.submission,
  });
  const { shop: _shop, orderId: _orderId, ...update } = record;

  return args.db.fatherDayCard.upsert({
    where: {
      shop_orderId: {
        shop: record.shop,
        orderId: record.orderId,
      },
    },
    create: record,
    update,
  });
}
