import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";

import { processPendingBackgroundJobs } from "../services/background-jobs.server";

function unauthorized() {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function backgroundJobSecret() {
  return process.env.BACKGROUND_JOB_SECRET?.trim();
}

function assertAuthorized(request: Request) {
  const secret = backgroundJobSecret();
  if (!secret) {
    throw new Response("Not Found", { status: 404 });
  }
  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${secret}`) {
    throw unauthorized();
  }
}

export const loader = async (_args: LoaderFunctionArgs) =>
  new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  assertAuthorized(request);
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || "10");
  const result = await processPendingBackgroundJobs(limit);
  return Response.json({ ok: true, ...result });
};
