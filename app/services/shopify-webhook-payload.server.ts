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
