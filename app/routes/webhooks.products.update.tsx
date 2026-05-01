import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { enqueueProductWebhookJob } from "../services/background-jobs.server";
import { productGidFromWebhookPayload } from "../services/shopify-webhook-payload.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const productGid = productGidFromWebhookPayload(payload);
  if (productGid) {
    await enqueueProductWebhookJob(shop, "PRODUCT_UPSERT", productGid);
  }
  return new Response();
};
