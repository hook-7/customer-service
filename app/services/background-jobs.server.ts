import prisma from "../db.server";
import {
  deleteProductKnowledge,
  syncProductByGid,
} from "./shopify-products.server";

export type BackgroundJobType = "PRODUCT_UPSERT" | "PRODUCT_DELETE";

const MAX_ATTEMPTS = 5;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function retryDelayMs(attempts: number) {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 60 * 60_000);
}

function productGidFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { productGid?: unknown }).productGid;
  return typeof value === "string" && value ? value : null;
}

export async function enqueueProductWebhookJob(
  shop: string,
  type: BackgroundJobType,
  productGid: string,
) {
  return prisma.backgroundJob.create({
    data: {
      shop,
      type,
      payload: { productGid },
    },
  });
}

async function runJob(type: BackgroundJobType, shop: string, payload: unknown) {
  const productGid = productGidFromPayload(payload);
  if (!productGid) throw new Error("Background job payload is missing productGid.");

  if (type === "PRODUCT_DELETE") {
    await deleteProductKnowledge(shop, productGid);
    return;
  }

  await syncProductByGid(shop, productGid);
}

export async function processPendingBackgroundJobs(limit = 10) {
  const now = new Date();
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      runAfter: { lte: now },
      lockedAt: null,
    },
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    take: Math.max(1, Math.min(limit, 50)),
  });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    const lock = await prisma.backgroundJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
        attempts: job.attempts,
        lockedAt: null,
      },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (!lock.count) continue;

    const locked = await prisma.backgroundJob.findUnique({ where: { id: job.id } });
    if (!locked) continue;

    processed += 1;
    try {
      await runJob(locked.type, locked.shop, locked.payload);
      await prisma.backgroundJob.update({
        where: { id: locked.id },
        data: {
          status: "SUCCEEDED",
          lockedAt: null,
          lastError: null,
        },
      });
      succeeded += 1;
    } catch (error) {
      const exhausted = locked.attempts >= MAX_ATTEMPTS;
      await prisma.backgroundJob.update({
        where: { id: locked.id },
        data: {
          status: "FAILED",
          lockedAt: null,
          lastError: errorMessage(error).slice(0, 2000),
          runAfter: new Date(Date.now() + (exhausted ? 24 * 60 * 60_000 : retryDelayMs(locked.attempts))),
        },
      });
      failed += 1;
    }
  }

  return { processed, succeeded, failed };
}
