import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

import {
  markProductDeleted,
  syncProductSnapshotToHermes,
  upsertProductSnapshot,
} from "../models/products.server";
import { unauthenticated } from "../shopify.server";

type ProductNode = {
  id: string;
  title: string;
  descriptionHtml?: string | null;
  handle: string;
  status?: string | null;
  onlineStoreUrl?: string | null;
  updatedAt?: string | null;
  featuredImage?: { url?: string | null } | null;
  priceRangeV2?: {
    minVariantPrice?: { amount?: string | null; currencyCode?: string | null } | null;
  } | null;
  variants?: {
    nodes?: Array<{
      id: string;
      price?: string | null;
      inventoryQuantity?: number | null;
      inventoryPolicy?: string | null;
    }>;
  } | null;
};

type ProductsResponse = {
  data?: {
    products?: {
      nodes?: ProductNode[];
      pageInfo?: { hasNextPage: boolean; endCursor?: string | null };
    };
  };
  errors?: unknown;
};

const PRODUCTS_QUERY = `#graphql
  query ProductSnapshots($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      nodes {
        id
        title
        descriptionHtml
        handle
        status
        onlineStoreUrl
        updatedAt
        featuredImage {
          url
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        variants(first: 25) {
          nodes {
            id
            price
            inventoryQuantity
            inventoryPolicy
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const PRODUCT_QUERY = `#graphql
  query ProductSnapshot($id: ID!) {
    product(id: $id) {
      id
      title
      descriptionHtml
      handle
      status
      onlineStoreUrl
      updatedAt
      featuredImage {
        url
      }
      priceRangeV2 {
        minVariantPrice {
          amount
          currencyCode
        }
      }
      variants(first: 25) {
        nodes {
          id
          price
          inventoryQuantity
          inventoryPolicy
        }
      }
    }
  }
`;

type ProductResponse = {
  data?: { product?: ProductNode | null };
  errors?: unknown;
};

function stripHtml(html?: string | null) {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storefrontUrl(shop: string, handle: string, onlineStoreUrl?: string | null) {
  return onlineStoreUrl || `https://${shop}/products/${handle}`;
}

function chooseDefaultVariant(product: ProductNode) {
  return (product.variants?.nodes || []).find((variant) => {
    const inventory = variant.inventoryQuantity ?? 0;
    return inventory > 0 || variant.inventoryPolicy === "CONTINUE";
  });
}

async function graphql<T>(
  admin: AdminApiContext,
  query: string,
  variables?: Record<string, unknown>,
) {
  const response = await admin.graphql(query, { variables });
  return (await response.json()) as T;
}

export async function syncShopifyProductNode(shop: string, product: ProductNode) {
  const defaultVariant = chooseDefaultVariant(product);
  const price = defaultVariant?.price || product.priceRangeV2?.minVariantPrice?.amount || null;
  const currencyCode = product.priceRangeV2?.minVariantPrice?.currencyCode || null;
  const published = product.status === "ACTIVE";
  const available = published && Boolean(defaultVariant);

  const snapshot = await upsertProductSnapshot(shop, {
    productGid: product.id,
    title: product.title,
    description: stripHtml(product.descriptionHtml),
    handle: product.handle,
    imageUrl: product.featuredImage?.url || null,
    productUrl: storefrontUrl(shop, product.handle, product.onlineStoreUrl),
    defaultVariantGid: defaultVariant?.id || null,
    price,
    currencyCode,
    available,
    published,
    sourceUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : null,
  });

  await syncProductSnapshotToHermes(shop, snapshot.productGid);
  return snapshot;
}

export async function syncAllPublishedProducts(admin: AdminApiContext, shop: string) {
  let after: string | null = null;
  let synced = 0;

  do {
    const data: ProductsResponse = await graphql<ProductsResponse>(admin, PRODUCTS_QUERY, {
      first: 50,
      after,
    });
    if (data.errors) throw new Error("Shopify products query failed.");

    const products = data.data?.products?.nodes || [];
    for (const product of products) {
      await syncShopifyProductNode(shop, product);
      synced += 1;
    }

    after = data.data?.products?.pageInfo?.hasNextPage
      ? data.data.products.pageInfo.endCursor || null
      : null;
  } while (after);

  return { synced };
}

export async function syncProductByGid(shop: string, productGid: string) {
  const { admin } = await unauthenticated.admin(shop);
  const data = await graphql<ProductResponse>(admin, PRODUCT_QUERY, { id: productGid });
  if (data.errors) throw new Error("Shopify product query failed.");

  const product = data.data?.product;
  if (!product) {
    await markProductDeleted(shop, productGid);
    await syncProductSnapshotToHermes(shop, productGid, "DELETE_PRODUCT");
    return null;
  }

  return syncShopifyProductNode(shop, product);
}

export async function deleteProductKnowledge(shop: string, productGid: string) {
  await markProductDeleted(shop, productGid);
  await syncProductSnapshotToHermes(shop, productGid, "DELETE_PRODUCT");
}
