import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useRouteError } from "@remix-run/react";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { useEffect, useRef } from "react";

import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { syncAllPublishedProducts } from "../services/shopify-products.server";

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") === "failed" ? "failed" : "all";
  const where =
    status === "failed"
      ? { shop: session.shop, hermesSyncStatus: "FAILED" as const }
      : { shop: session.shop };
  const products = await prisma.productSnapshot.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  const total = await prisma.productSnapshot.count({ where: { shop: session.shop } });
  const synced = await prisma.productSnapshot.count({
    where: { shop: session.shop, hermesSyncStatus: "SYNCED" },
  });
  const failed = await prisma.productSnapshot.count({
    where: { shop: session.shop, hermesSyncStatus: "FAILED" },
  });
  const pending = await prisma.productSnapshot.count({
    where: { shop: session.shop, hermesSyncStatus: "PENDING" },
  });
  const latestSync = await prisma.productSnapshot.aggregate({
    where: { shop: session.shop, hermesSyncedAt: { not: null } },
    _max: { hermesSyncedAt: true },
  });

  return {
    status,
    total,
    synced,
    failed,
    pending,
    latestSyncAt: latestSync._max.hermesSyncedAt?.toISOString() ?? null,
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      available: product.available,
      published: product.published,
      price: product.price,
      currencyCode: product.currencyCode,
      hermesSyncStatus: product.hermesSyncStatus,
      updatedAt: product.updatedAt.toISOString(),
      hermesSyncedAt: product.hermesSyncedAt?.toISOString() ?? null,
      hermesError: product.hermesError,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();
  if (intent !== "sync") return { error: "unknown_intent" };

  const result = await syncAllPublishedProducts(admin, session.shop);
  return { ok: true as const, synced: result.synced };
};

export default function ProductsPage() {
  const { status, total, synced, failed, pending, latestSyncAt, products } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const lastData = useRef<typeof fetcher.data>(undefined);
  const busy = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    const data = fetcher.data;
    if (!data || data === lastData.current) return;
    lastData.current = data;
    if ("ok" in data) {
      shopify.toast.show(`已同步 ${data.synced} 个商品。`);
    } else {
      shopify.toast.show("商品同步失败。", { isError: true });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return (
    <Page
      title="商品知识库"
      primaryAction={{
        content: "同步已发布商品",
        onAction: () => fetcher.submit({ intent: "sync" }, { method: "post" }),
        loading: busy,
      }}
    >
      <TitleBar title="商品知识库" />
      <BlockStack gap="400">
        <InlineStack gap="400" wrap>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">
                商品快照
              </Text>
              <Text as="p" variant="headingLg">
                {total}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">
                Hermes 已同步
              </Text>
              <Text as="p" variant="headingLg">
                {synced}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">
                等待同步
              </Text>
              <Text as="p" variant="headingLg">
                {pending}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">
                同步失败
              </Text>
              <Text as="p" variant="headingLg">
                {failed}
              </Text>
            </BlockStack>
          </Card>
        </InlineStack>

        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                同步状态
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                最近成功同步：
                {latestSyncAt ? new Date(latestSyncAt).toLocaleString() : "暂无"}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                当前列表：{status === "failed" ? "仅显示同步失败商品" : "显示最近 50 个商品"}
              </Text>
            </BlockStack>
            <InlineStack gap="200">
              <Button url="/app/products?status=failed" disabled={status === "failed"}>
                只看失败
              </Button>
              <Button url="/app/products" disabled={status === "all"}>
                显示全部
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>

        <Card padding="0">
          <IndexTable
            resourceName={{ singular: "商品", plural: "商品" }}
            itemCount={products.length}
            headings={[
              { title: "商品" },
              { title: "状态" },
              { title: "价格" },
              { title: "Hermes" },
              { title: "更新时间" },
            ]}
            selectable={false}
          >
            {products.map((product, index) => (
              <IndexTable.Row
                id={product.id}
                key={product.id}
                position={index}
              >
                <IndexTable.Cell>
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold">
                      {product.title}
                    </Text>
                    {product.hermesError ? (
                      <Text as="span" variant="bodySm" tone="critical">
                        {product.hermesError}
                      </Text>
                    ) : null}
                  </BlockStack>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={product.available ? "success" : "critical"}>
                    {product.available ? "可售" : "不可售"}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {product.price
                    ? `${product.price} ${product.currencyCode || ""}`.trim()
                    : "-"}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge
                    tone={
                      product.hermesSyncStatus === "SYNCED"
                        ? "success"
                        : product.hermesSyncStatus === "FAILED"
                          ? "critical"
                          : "attention"
                    }
                  >
                    {product.hermesSyncStatus}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {new Date(product.updatedAt).toLocaleString()}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>

        <Button
          onClick={() => fetcher.submit({ intent: "sync" }, { method: "post" })}
          loading={busy}
        >
          重新同步
        </Button>
      </BlockStack>
    </Page>
  );
}
