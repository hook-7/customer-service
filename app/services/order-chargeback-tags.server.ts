import { unauthenticated } from "../shopify.server";
import {
  checkAndTagOrderForPreviousChargeback,
  orderChargebackTagPayloadFromJobPayload,
  parseChargebackTestEmails,
} from "./order-chargeback-tags";

export async function processOrderChargebackTagCheck(shop: string, payload: unknown) {
  const orderPayload = orderChargebackTagPayloadFromJobPayload(payload);
  if (!orderPayload.email) {
    console.log(`Skipping chargeback tag check for ${orderPayload.orderGid}: missing email.`);
    return { tagged: false, reason: "missing_email" as const };
  }

  const { admin } = await unauthenticated.admin(shop);
  return checkAndTagOrderForPreviousChargeback(admin, orderPayload, {
    testEmails: parseChargebackTestEmails(process.env.CHARGEBACK_TEST_EMAILS),
  });
}
