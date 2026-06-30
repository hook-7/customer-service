import type { ActionFunctionArgs } from "@remix-run/node";

import { enqueueOrderChargebackTagCheckJob } from "../services/background-jobs.server";
import { orderChargebackTagPayloadFromWebhookPayload } from "../services/shopify-webhook-payload.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const orderPayload = orderChargebackTagPayloadFromWebhookPayload(payload);
  if (orderPayload) {
    await enqueueOrderChargebackTagCheckJob(shop, orderPayload);
  }
  return new Response();
};
