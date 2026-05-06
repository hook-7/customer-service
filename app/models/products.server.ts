import prisma from "../db.server";
import { pushProductKnowledgeToHermes } from "../services/hermes.server";

export type ProductCard = {
  productGid: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  variantGid?: string | null;
  price?: string | null;
  currencyCode?: string | null;
  reason?: string | null;
  available: boolean;
};

export type ProductSyncOptions = {
  finalFailure?: boolean;
  scheduleRetryOnFailure?: boolean;
};

const RETRYABLE_JOB_STATUSES = ["PENDING", "RUNNING", "FAILED"] as const;

function productGidFromJobPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { productGid?: unknown }).productGid;
  return typeof value === "string" && value ? value : null;
}

async function enqueueProductRetryJob(shop: string, productGid: string) {
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      shop,
      type: "PRODUCT_UPSERT",
      status: { in: [...RETRYABLE_JOB_STATUSES] },
    },
    select: { payload: true },
    take: 100,
  });
  const alreadyQueued = jobs.some(
    (job) => productGidFromJobPayload(job.payload) === productGid,
  );
  if (alreadyQueued) return null;

  return prisma.backgroundJob.create({
    data: {
      shop,
      type: "PRODUCT_UPSERT",
      payload: { productGid },
      runAfter: new Date(Date.now() + 60_000),
    },
  });
}

export async function listAvailableProductSnapshots(shop: string, take = 20) {
  return prisma.productSnapshot.findMany({
    where: { shop, available: true, published: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function getRecommendedProductCards(
  shop: string,
  productGids: string[],
  reasons?: Record<string, string>,
): Promise<ProductCard[]> {
  if (!productGids.length) return [];

  const products = await prisma.productSnapshot.findMany({
    where: {
      shop,
      productGid: { in: productGids },
      available: true,
      published: true,
    },
  });
  const byId = new Map(products.map((product) => [product.productGid, product]));

  return productGids
    .map((id) => byId.get(id))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))
    .map((product) => ({
      productGid: product.productGid,
      title: product.title,
      description: product.description,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      variantGid: product.defaultVariantGid,
      price: product.price,
      currencyCode: product.currencyCode,
      reason: reasons?.[product.productGid] || null,
      available: product.available && product.published && Boolean(product.defaultVariantGid),
    }));
}

export async function buildProductContext(shop: string) {
  const products = await listAvailableProductSnapshots(shop, 25);
  return products
    .map((product) =>
      [
        `ID: ${product.productGid}`,
        `Title: ${product.title}`,
        product.description ? `Description: ${product.description.slice(0, 500)}` : "",
        product.price ? `Price: ${product.price} ${product.currencyCode || ""}`.trim() : "",
        product.productUrl ? `URL: ${product.productUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n---\n\n");
}

export async function upsertProductSnapshot(
  shop: string,
  input: {
    productGid: string;
    title: string;
    description?: string | null;
    handle: string;
    imageUrl?: string | null;
    productUrl?: string | null;
    defaultVariantGid?: string | null;
    price?: string | null;
    currencyCode?: string | null;
    available: boolean;
    published: boolean;
    sourceUpdatedAt?: Date | null;
  },
) {
  return prisma.productSnapshot.upsert({
    where: { shop_productGid: { shop, productGid: input.productGid } },
    create: {
      shop,
      ...input,
      hermesSyncStatus: "PENDING",
    },
    update: {
      ...input,
      hermesSyncStatus: "PENDING",
      hermesError: null,
    },
  });
}

export async function markProductDeleted(shop: string, productGid: string) {
  return prisma.productSnapshot.updateMany({
    where: { shop, productGid },
    data: {
      available: false,
      published: false,
      hermesSyncStatus: "PENDING",
      hermesError: null,
    },
  });
}

export async function syncProductSnapshotToHermes(
  shop: string,
  productGid: string,
  action: "UPSERT_PRODUCT" | "DELETE_PRODUCT" = "UPSERT_PRODUCT",
  options: ProductSyncOptions = {},
) {
  const product = await prisma.productSnapshot.findUnique({
    where: { shop_productGid: { shop, productGid } },
  });
  if (!product) return false;

  if (action === "UPSERT_PRODUCT" && (!product.available || !product.published)) {
    await prisma.productSnapshot.update({
      where: { shop_productGid: { shop, productGid } },
      data: {
        hermesSyncStatus: "SYNCED",
        hermesSyncedAt: new Date(),
        hermesError: null,
      },
    });
    return true;
  }

  const result = await pushProductKnowledgeToHermes({
    shop,
    action,
    payload: product,
  });

  await prisma.productSnapshot.update({
    where: { shop_productGid: { shop, productGid } },
    data: result.ok
      ? {
          hermesSyncStatus: "SYNCED",
          hermesSyncedAt: new Date(),
          hermesError: null,
        }
      : options.finalFailure
        ? {
            hermesSyncStatus: "FAILED",
            hermesError: result.error || "Hermes API did not accept the product update.",
          }
        : {
            hermesSyncStatus: "PENDING",
            hermesError: result.error || "Hermes API did not accept the product update.",
          },
  });

  if (!result.ok && !options.finalFailure && options.scheduleRetryOnFailure !== false) {
    await enqueueProductRetryJob(shop, productGid);
  }

  return result.ok;
}
