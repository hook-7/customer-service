export const PREVIOUS_CHARGEBACK_TAG = "🔴曾经拒付";

export const CHARGEBACK_STATUSES = [
  "accepted",
  "charge_refunded",
  "lost",
  "needs_response",
  "under_review",
  "won",
] as const;

export type ChargebackStatus = (typeof CHARGEBACK_STATUSES)[number];

export type OrderChargebackTagJobPayload = {
  orderGid: string;
  email: string | null;
};

type AdminGraphqlClient = {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<{ json(): Promise<unknown> }>;
};

type OrdersResponse = {
  data?: {
    orders?: {
      nodes?: Array<{ id?: string | null }>;
    };
  };
  errors?: unknown;
};

type TagsAddResponse = {
  data?: {
    tagsAdd?: {
      node?: { id?: string | null } | null;
      userErrors?: TagsAddUserError[];
    };
  };
  errors?: unknown;
};

type TagsAddUserError = {
  field?: string[] | null;
  message?: string | null;
};

export type OrderChargebackTagResult =
  | { tagged: true; matchedStatus: ChargebackStatus | "test_email" }
  | { tagged: false; reason: "missing_email" | "no_chargeback_history" };

export const HISTORICAL_CHARGEBACK_ORDERS_QUERY = `#graphql
  query HistoricalChargebackOrders($query: String!) {
    orders(first: 1, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes {
        id
      }
    }
  }
`;

export const ADD_ORDER_CHARGEBACK_TAG_MUTATION = `#graphql
  mutation AddOrderChargebackTag($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export function normalizeOrderEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email || null;
}

export function parseChargebackTestEmails(value: unknown) {
  if (typeof value !== "string") return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((email) => normalizeOrderEmail(email))
      .filter((email): email is string => Boolean(email)),
  );
}

function escapeSearchPhrase(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function historicalChargebackOrderQuery(email: string, status: ChargebackStatus) {
  return `email:"${escapeSearchPhrase(email)}" chargeback_status:${status}`;
}

async function graphql<T>(
  admin: AdminGraphqlClient,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await admin.graphql(query, { variables });
  return (await response.json()) as T;
}

function userErrorMessage(errors: TagsAddUserError[]) {
  const first = errors.find((error) => error.message);
  return first?.message || "Shopify order tag mutation returned a user error.";
}

export async function historicalChargebackStatusForEmail(
  admin: AdminGraphqlClient,
  email: string,
) {
  for (const status of CHARGEBACK_STATUSES) {
    const data = await graphql<OrdersResponse>(admin, HISTORICAL_CHARGEBACK_ORDERS_QUERY, {
      query: historicalChargebackOrderQuery(email, status),
    });
    if (data.errors) throw new Error("Shopify historical chargeback order query failed.");

    const hasMatch = Boolean(data.data?.orders?.nodes?.length);
    if (hasMatch) return status;
  }
  return null;
}

export async function addPreviousChargebackTag(admin: AdminGraphqlClient, orderGid: string) {
  const data = await graphql<TagsAddResponse>(admin, ADD_ORDER_CHARGEBACK_TAG_MUTATION, {
    id: orderGid,
    tags: [PREVIOUS_CHARGEBACK_TAG],
  });
  if (data.errors) throw new Error("Shopify order tag mutation failed.");

  const userErrors = data.data?.tagsAdd?.userErrors || [];
  if (userErrors.length) throw new Error(userErrorMessage(userErrors));
}

export async function checkAndTagOrderForPreviousChargeback(
  admin: AdminGraphqlClient,
  payload: OrderChargebackTagJobPayload,
  options: { testEmails?: Set<string> } = {},
): Promise<OrderChargebackTagResult> {
  const email = normalizeOrderEmail(payload.email);
  if (!email) return { tagged: false, reason: "missing_email" };

  if (options.testEmails?.has(email)) {
    await addPreviousChargebackTag(admin, payload.orderGid);
    return { tagged: true, matchedStatus: "test_email" };
  }

  const matchedStatus = await historicalChargebackStatusForEmail(admin, email);
  if (!matchedStatus) return { tagged: false, reason: "no_chargeback_history" };

  await addPreviousChargebackTag(admin, payload.orderGid);
  return { tagged: true, matchedStatus };
}

export function orderChargebackTagPayloadFromJobPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Background job payload is missing order data.");
  }

  const data = payload as { orderGid?: unknown; email?: unknown };
  if (typeof data.orderGid !== "string" || !data.orderGid) {
    throw new Error("Background job payload is missing orderGid.");
  }

  return {
    orderGid: data.orderGid,
    email: normalizeOrderEmail(data.email),
  } satisfies OrderChargebackTagJobPayload;
}
