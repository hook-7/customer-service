import {
  json as remixJson,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";

import {
  normalizeShopDomain,
  saveFatherDayCardSubmission,
  validateFatherDayCardSubmission,
} from "../services/fathers-day-card.server";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

type Cors = (response: Response) => Response;

function json(
  cors: Cors,
  data: unknown,
  init?: ResponseInit,
) {
  return cors(remixJson(data, init));
}

function errorResponse(
  cors: Cors,
  error: string,
  status: number,
  field?: string,
  details?: unknown,
) {
  return json(
    cors,
    {
      ok: false,
      error,
      ...(field ? { field } : {}),
      ...(details ? { details } : {}),
    },
    { status },
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { cors } = await authenticate.public.checkout(request);
  return cors(new Response("Method Not Allowed", { status: 405 }));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.public.checkout(request);

  if (request.method !== "POST") {
    return cors(new Response("Method Not Allowed", { status: 405 }));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(cors, "invalid_json", 400);
  }

  const validation = validateFatherDayCardSubmission(body);
  if (!validation.ok) {
    return errorResponse(cors, validation.error, 400, validation.field);
  }

  const shop = normalizeShopDomain(sessionToken.dest);
  if (!shop) {
    return errorResponse(cors, "invalid_shop", 401);
  }

  try {
    await saveFatherDayCardSubmission({
      db: prisma,
      shop,
      submission: validation.value,
    });
  } catch (error) {
    console.error("[Father's Day card database write failed]", {
      shop,
      orderId: validation.value.orderId,
      error,
    });
    return errorResponse(cors, "card_save_failed", 500);
  }

  return json(cors, { ok: true });
};
