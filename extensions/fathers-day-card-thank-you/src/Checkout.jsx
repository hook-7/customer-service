// @ts-check
import "@shopify/ui-extensions/preact";
import {
  useCustomer,
  useEmail,
  useSettings,
} from "@shopify/ui-extensions/checkout/preact";
import { render } from "preact";
import { useMemo, useState } from "preact/hooks";

const API_PATH = "/api/fathers-day-card";
const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;
const MESSAGE_MAX_LENGTH = 300;
const DEFAULT_RELATIONSHIP = "dad";
const RECIPIENT_RELATIONSHIPS = [
  ["dad", "Dad"],
  ["papa", "Papa"],
  ["grandpa", "Grandpa"],
  ["husband", "Husband"],
  ["friend", "Friend"],
];
const FOUNDER_LETTER_SENDER_RELATIONSHIPS = [
  ["son", "Son"],
  ["daughter", "Daughter"],
  ["wife", "Wife"],
];
const FOUNDER_LETTER_ICON =
  "data:image/svg+xml,%3Csvg width='48' height='48' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='20' y='12' width='22' height='29' rx='2.6' fill='%23F7F7F4' stroke='%23E3DFD8' stroke-width='1.4'/%3E%3Cpath d='M26 22H35.5M26 26H38M26 30H36' stroke='%23C9C3B8' stroke-width='1.3' stroke-linecap='round'/%3E%3Cpath d='M12.2 5.5H26.2L23.2 12.2H15.1L12.2 5.5Z' fill='%2311234A'/%3E%3Cpath d='M15.1 12.2H23.2L28.1 39L18.8 45L9.4 39L15.1 12.2Z' fill='%2311234A'/%3E%3Cpath d='M14 24.7L24.4 18.2M12.8 31.8L25.8 23.7M14 38.6L26.8 30.6' stroke='%23C8894B' stroke-width='1.8' stroke-linecap='round'/%3E%3Cpath d='M15.1 12.2L18.7 16.2L23.2 12.2' stroke='%23263C72' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const ERROR_MESSAGES = {
  invalid_body: "Please check the card details and try again.",
  invalid_json: "We could not read the card details. Please try again.",
  invalid_order_id: "We could not confirm this order yet. Please refresh the page.",
  missing_checkout_token:
    "We could not confirm this checkout yet. Please refresh the page.",
  message_option_required: "Choose at least one Father's Day message.",
  father_name_required: "Enter the recipient's name.",
  father_name_too_long: "Use 80 characters or fewer.",
  message_required: "Enter a message for the card.",
  message_too_long: "Use 300 characters or fewer.",
  father_email_required: "Enter the recipient's email.",
  father_email_invalid: "Enter a valid email address.",
  father_email_too_long: "Use 254 characters or fewer.",
  sender_name_required: "Enter who the card is from.",
  sender_name_too_long: "Use 80 characters or fewer.",
  recipient_relationship_required: "Choose who this card is for.",
  recipient_relationship_invalid: "Choose who this card is for.",
  founder_letter_sender_relationship_required:
    "Choose your relationship to the recipient.",
  founder_letter_sender_relationship_invalid:
    "Choose your relationship to the recipient.",
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
  const settings = useSettings();
  const apiConfig = resolveApiBaseUrl(settings.api_base_url);
  const customer = useCustomer();
  const buyerEmail = useEmail();
  const customerEmail = buyerEmail ?? customer?.email ?? "";
  const customerName =
    customer?.fullName ??
    [customer?.firstName, customer?.lastName].filter(Boolean).join(" ");
  const customerId = customer?.id ?? "";

  const [includeCard, setIncludeCard] = useState(false);
  const [fatherName, setFatherName] = useState("");
  const [message, setMessage] = useState("");
  const [fatherEmail, setFatherEmail] = useState("");
  const [senderName, setSenderName] = useState(customerName);
  const [recipientRelationship, setRecipientRelationship] =
    useState(DEFAULT_RELATIONSHIP);
  const [includeFounderLetter, setIncludeFounderLetter] = useState(false);
  const [
    founderLetterSenderRelationship,
    setFounderLetterSenderRelationship,
  ] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");

  const isSubmitting = status === "submitting";
  const isSubmitted = status === "submitted";
  const hasSelectedOption = includeCard || includeFounderLetter;
  const canSubmit = useMemo(
    () =>
      Boolean(
        orderId &&
          checkoutToken &&
          hasSelectedOption &&
          fatherName.trim() &&
          fatherEmail.trim() &&
          senderName.trim() &&
          (!includeCard || (message.trim() && recipientRelationship)) &&
          (!includeFounderLetter || founderLetterSenderRelationship) &&
          !apiConfig.error,
      ),
    [
      checkoutToken,
      fatherEmail,
      founderLetterSenderRelationship,
      fatherName,
      hasSelectedOption,
      includeFounderLetter,
      includeCard,
      message,
      orderId,
      apiConfig.error,
      recipientRelationship,
      senderName,
    ],
  );

  if (isSubmitted) {
    return (
      <s-banner heading="Father's Day e-card saved" tone="success">
        We'll send the card on Father's Day, June 21.
      </s-banner>
    );
  }

  if (!orderId || !checkoutToken) {
    return (
      <s-banner heading="Card details unavailable" tone="warning">
        We could not load this order yet. Refresh this page before adding a
        Father's Day e-card.
      </s-banner>
    );
  }

  return (
    <s-section>
      <s-stack gap="base">
        <s-box
          border="base"
          borderRadius="large"
          padding="base"
          accessibilityLabel="Father's Day message options"
        >
          <s-stack gap="base">
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-box inlineSize="48px">
                <s-image
                  src={FOUNDER_LETTER_ICON}
                  alt=""
                  inlineSize="fill"
                  objectFit="contain"
                />
              </s-box>
              <s-heading></s-heading>
            </s-stack>
            <s-checkbox
              label="Is this a gift? Send a free Father's Day e-card"
              checked={includeCard}
              disabled={isSubmitting}
              onChange={(event) => {
                const checked = readCheckedValue(event);
                setIncludeCard(checked);
                if (!checked) {
                  clearError();
                }
              }}
            />
            <s-checkbox
              label="Add a personal letter from our Founder"
              checked={includeFounderLetter}
              disabled={isSubmitting}
              onChange={(event) => {
                const checked = readCheckedValue(event);
                setIncludeFounderLetter(checked);
                if (!checked) {
                  setFounderLetterSenderRelationship("");
                }
                clearError();
              }}
            />
            {includeFounderLetter ? (
              <s-select
                label="I am his..."
                name="founderLetterSenderRelationship"
                placeholder="Select one"
                value={founderLetterSenderRelationship}
                required
                disabled={isSubmitting}
                error={
                  fieldError === "founderLetterSenderRelationship"
                    ? error
                    : undefined
                }
                onChange={(event) => {
                  const value = readSelectValue(event);
                  if (typeof value === "string") {
                    setFounderLetterSenderRelationship(value);
                    clearError();
                  }
                }}
              >
                {FOUNDER_LETTER_SENDER_RELATIONSHIPS.map(([value, label]) => (
                  <s-option key={value} value={value}>
                    {label}
                  </s-option>
                ))}
              </s-select>
            ) : null}
            {hasSelectedOption ? (
              <s-stack gap="base">
                {error ? (
                  <s-banner heading="Card not saved" tone="critical">
                    {error}
                  </s-banner>
                ) : null}
                {apiConfig.error ? (
                  <s-banner heading="Card saving unavailable" tone="critical">
                    {apiConfig.error}
                  </s-banner>
                ) : null}
                <s-text-field
                  label="Recipient's Name"
                  placeholder='e.g. "Dad", "Papa John"'
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
                <s-email-field
                  label="Send to Email"
                  placeholder="their email address"
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
                <s-text-field
                  label="From"
                  placeholder='your name, e.g. "From Tracy"'
                  maxLength={NAME_MAX_LENGTH}
                  required
                  value={senderName}
                  disabled={isSubmitting}
                  error={fieldError === "senderName" ? error : undefined}
                  onInput={(event) => {
                    setSenderName(readFieldValue(event));
                    clearError();
                  }}
                />
                {includeCard ? (
                  <>
                    <s-text-area
                      label="Your Message"
                      placeholder="write what you'd like to say"
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
                    <s-select
                      label="This card is for my..."
                      name="recipientRelationship"
                      value={recipientRelationship}
                      required
                      disabled={isSubmitting}
                      error={
                        fieldError === "recipientRelationship"
                          ? error
                          : undefined
                      }
                      onChange={(event) => {
                        const value = readSelectValue(event);
                        if (typeof value === "string") {
                          setRecipientRelationship(value);
                          clearError();
                        }
                      }}
                    >
                      {RECIPIENT_RELATIONSHIPS.map(([value, label]) => (
                        <s-option key={value} value={value}>
                          {label}
                        </s-option>
                      ))}
                    </s-select>
                  </>
                ) : null}
                <s-text tone="neutral">
                  We'll send selected Father's Day messages on Father's Day,
                  June 21.
                </s-text>
                <s-button
                  variant="primary"
                  loading={isSubmitting}
                  disabled={isSubmitting || !canSubmit}
                  onClick={submitCard}
                >
                  Save Father's Day messages
                </s-button>
              </s-stack>
            ) : null}
          </s-stack>
        </s-box>
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
      const response = await fetch(buildApiUrl(apiConfig.url), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId,
          orderNumber,
          checkoutToken,
          includeCard,
          fatherName,
          message: includeCard ? message : "",
          fatherEmail,
          senderName,
          recipientRelationship: includeCard ? recipientRelationship : "",
          includeFounderLetter,
          founderLetterSenderRelationship: includeFounderLetter
            ? founderLetterSenderRelationship
            : "",
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
      console.error("[Father's Day e-card submit failed]", submitError);
      setStatus("idle");
      setError("We could not save the card details. Please try again.");
    }
  }
}

/**
 * @param {unknown} value
 */
function resolveApiBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return {
      url: "",
      error: "The e-card API base URL is not configured.",
    };
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") {
      return {
        url: "",
        error: "The e-card API base URL must start with https://.",
      };
    }
    return { url: url.origin, error: "" };
  } catch {
    return {
      url: "",
      error: "The e-card API base URL is not valid.",
    };
  }
}

/**
 * @param {string} apiBaseUrl
 */
function buildApiUrl(apiBaseUrl) {
  return new URL(API_PATH, apiBaseUrl).toString();
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
 * @param {Event} event
 */
function readCheckedValue(event) {
  const target = event.currentTarget;
  return Boolean("checked" in target && target.checked);
}

/**
 * @param {Event} event
 */
function readSelectValue(event) {
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
