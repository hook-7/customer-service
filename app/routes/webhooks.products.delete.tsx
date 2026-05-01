import type { ActionFunctionArgs } from "@remix-run/node";

import { authenticate } from "../shopify.server";
import { deleteProductKnowledge } from "../services/shopify-products.server";

function productGidFromPayload(payload: unknown) {
  const data = payload as { admin_graphql_api_id?: unknown; id?: unknown };
  if (typeof data.admin_graphql_api_id === "string") return data.admin_graphql_api_id;
  if (typeof data.id === "number" || typeof data.id === "string") {
    return `gid://shopify/Product/${data.id}`;
  }
  return null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop } = await authenticate.webhook(request);
  const productGid = productGidFromPayload(payload);
  if (productGid) await deleteProductKnowledge(shop, productGid);
  return new Response();
};
