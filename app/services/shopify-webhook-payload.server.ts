export function productGidFromWebhookPayload(payload: unknown) {
  const data = payload as { admin_graphql_api_id?: unknown; id?: unknown };
  if (typeof data.admin_graphql_api_id === "string") {
    return data.admin_graphql_api_id;
  }
  if (typeof data.id === "number" || typeof data.id === "string") {
    return `gid://shopify/Product/${data.id}`;
  }
  return null;
}

export function orderChargebackTagPayloadFromWebhookPayload(payload: unknown) {
  const data = payload as {
    admin_graphql_api_id?: unknown;
    id?: unknown;
    email?: unknown;
    contact_email?: unknown;
  };

  let orderGid: string | null = null;
  if (typeof data.admin_graphql_api_id === "string") {
    orderGid = data.admin_graphql_api_id;
  } else if (typeof data.id === "number" || typeof data.id === "string") {
    orderGid = `gid://shopify/Order/${data.id}`;
  }

  if (!orderGid) return null;

  const email =
    typeof data.email === "string" && data.email.trim()
      ? data.email
      : typeof data.contact_email === "string" && data.contact_email.trim()
        ? data.contact_email
        : null;

  return { orderGid, email };
}
