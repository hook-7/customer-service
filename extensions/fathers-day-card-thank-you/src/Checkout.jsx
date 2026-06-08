// @ts-check
import "@shopify/ui-extensions/preact";
import { useCustomer, useEmail } from "@shopify/ui-extensions/checkout/preact";
import { render } from "preact";
import { useMemo, useState } from "preact/hooks";

const API_BASE_URL = "https://shopify-app.livall.com";
const API_PATH = "/api/fathers-day-card";
const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const MESSAGE_MAX_LENGTH = 300;

const ERROR_MESSAGES = {
  invalid_body: "Please check the card details and try again.",
  invalid_json: "We could not read the card details. Please try again.",
  invalid_order_id: "We could not confirm this order yet. Please refresh the page.",
  missing_checkout_token:
    "We could not confirm this checkout yet. Please refresh the page.",
  father_name_required: "Enter your father's name.",
  father_name_too_long: "Use 80 characters or fewer.",
  message_required: "Enter a message for the card.",
  message_too_long: "Use 300 characters or fewer.",
  father_email_required: "Enter your father's email.",
  father_email_invalid: "Enter a valid email address.",
  father_email_too_long: "Use 254 characters or fewer.",
  card_save_failed:
    "We could not save the card details. Please try again in a moment.",
};

export default function extension() {
  render(<FatherDayCardForm />, document.body);
}

function FatherDayCardForm() {
  const checkout =
    /** @type {import("@shopify/ui-extensions/purchase.thank-you.block.render").Api} */ (
      /** @type {unknown} */ (shopify)
    );
  const orderConfirmation = checkout.orderConfirmation.value;
  const checkoutToken = checkout.checkoutToken.value;
  const orderId = orderConfirmation?.order.id ?? "";
  const orderNumber = orderConfirmation?.number ?? "";
  const customer = useCustomer();
  const buyerEmail = useEmail();
  const customerEmail = buyerEmail ?? customer?.email ?? "";
  const customerName =
    customer?.fullName ??
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ");
  const customerId = customer?.id ?? "";

  const [fatherName, setFatherName] = useState("");
  const [message, setMessage] = useState("");
  const [fatherEmail, setFatherEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const isSubmitting = status === "submitting";
  const isSubmitted = status === "submitted";
  const canSubmit = useMemo(
    () =>
      Boolean(
        orderId &&
          checkoutToken &&
          fatherName.trim() &&
          message.trim() &&
          fatherEmail.trim(),
      ),
    [checkoutToken, fatherEmail, fatherName, message, orderId],
  );

  if (isSubmitted) {
    return (
      <s-banner heading="Father's Day card saved" tone="success">
        The card details have been added to this order.
      </s-banner>
    );
  }

  if (!orderId || !checkoutToken) {
    return (
      <s-banner heading="Card details unavailable" tone="warning">
        We could not load this order yet. Refresh this page before adding a
        Father's Day card.
      </s-banner>
    );
  }

  return (
    <s-section heading="Father's Day card">
      <s-stack gap="base">
        <s-text>
          Add your Father's Day card details.
        </s-text>
        {error ? (
          <s-banner heading="Card not saved" tone="critical">
            {error}
          </s-banner>
        ) : null}
        <s-text-field
          label="Father's name"
          maxLength={NAME_MAX_LENGTH}
          required
          value={fatherName}
          disabled={isSubmitting}
          error={fieldError === "fatherName" ? error : undefined}
          onInput={(event) => {
            setFatherName(readFieldValue(event));
            clearError();
          }}
        />
        <s-text-area
          label="Message"
          maxLength={MESSAGE_MAX_LENGTH}
          rows={4}
          required
          value={message}
          disabled={isSubmitting}
          error={fieldError === "message" ? error : undefined}
          onInput={(event) => {
            setMessage(readFieldValue(event));
            clearError();
          }}
        />
        <s-email-field
          label="Father's email"
          maxLength={EMAIL_MAX_LENGTH}
          required
          value={fatherEmail}
          disabled={isSubmitting}
          error={fieldError === "fatherEmail" ? error : undefined}
          onInput={(event) => {
            setFatherEmail(readFieldValue(event));
            clearError();
          }}
        />
        <s-button
          variant="primary"
          loading={isSubmitting}
          disabled={isSubmitting || !canSubmit}
          onClick={submitCard}
        >
          Save card details
        </s-button>
        {orderNumber ? <s-text tone="neutral">Order {orderNumber}</s-text> : null}
      </s-stack>
    </s-section>
  );

  function clearError() {
    if (!error) return;
    setError("");
    setFieldError("");
  }

  async function submitCard() {
    if (!canSubmit || isSubmitting) return;

    setStatus("submitting");
    setError("");
    setFieldError("");

    try {
      const token = await checkout.sessionToken.get();
      const response = await fetch(buildApiUrl(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId,
          orderNumber,
          checkoutToken,
          fatherName,
          message,
          fatherEmail,
          customerId,
          customerEmail,
          customerName,
        }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.ok) {
        setStatus("idle");
        setFieldError(typeof result.field === "string" ? result.field : "");
        setError(messageForError(result.error));
        return;
      }

      setStatus("submitted");
    } catch (submitError) {
      console.error("[Father's Day card submit failed]", submitError);
      setStatus("idle");
      setError("We could not save the card details. Please try again.");
    }
  }
}

function buildApiUrl() {
  return new URL(API_PATH, API_BASE_URL).toString();
}

/**
 * @param {Event} event
 */
function readFieldValue(event) {
  const target = event.currentTarget;
  return "value" in target && typeof target.value === "string"
    ? target.value
    : "";
}

/**
 * @param {unknown} code
 */
function messageForError(code) {
  return typeof code === "string" && code in ERROR_MESSAGES
    ? ERROR_MESSAGES[code]
    : "We could not save the card details. Please try again.";
}
