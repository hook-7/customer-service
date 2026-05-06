import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { Form, useFetcher, useLoaderData, useRouteError } from "@remix-run/react";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-remix/server";
import type { Prisma } from "@prisma/client";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  IndexTable,
  InlineStack,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";

import prisma from "../db.server";
import {
  parseProductStatusFilter,
  productSyncStatusFilter,
  productSyncStatusLabel,
  type ProductStatusFilter,
} from "../services/admin-products";
import { authenticate } from "../shopify.server";
import {
  syncAllPublishedProducts,
  syncProductByGid,
} from "../services/shopify-products.server";

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

const statusOptions = [
  { label: "全部同步状态", value: "all" },
  { label: "同步失败", value: "failed" },
  { label: "等待同步", value: "pending" },
  { label: "已同步", value: "synced" },
];

function statusTone(status: string) {
  if (status === "SYNCED") return "success" as const;
  if (status === "FAILED") return "critical" as const;
  return "attention" as const;
}

function shortError(error?: string | null) {
  if (!error) return "";
  const normalized = error.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function productsUrl(status: ProductStatusFilter, q = "") {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (q.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return qs ? `/app/products?${qs}` : "/app/products";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = parseProductStatusFilter(url.searchParams.get("status"));
  const q = url.searchParams.get("q")?.trim() ?? "";
  const syncStatus = productSyncStatusFilter(status);

  const where: Prisma.ProductSnapshotWhereInput = { shop: session.shop };
  if (syncStatus) where.hermesSyncStatus = syncStatus;
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { handle: { contains: q } },
      { hermesError: { contains: q } },
    ];
  }

  const [products, total, synced, failed, pending, matchingTotal, latestSync] =
    await Promise.all([
      prisma.productSnapshot.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.productSnapshot.count({ where: { shop: session.shop } }),
      prisma.productSnapshot.count({
        where: { shop: session.shop, hermesSyncStatus: "SYNCED" },
      }),
      prisma.productSnapshot.count({
        where: { shop: session.shop, hermesSyncStatus: "FAILED" },
      }),
      prisma.productSnapshot.count({
        where: { shop: session.shop, hermesSyncStatus: "PENDING" },
      }),
      prisma.productSnapshot.count({ where }),
      prisma.productSnapshot.aggregate({
        where: { shop: session.shop, hermesSyncedAt: { not: null } },
        _max: { hermesSyncedAt: true },
      }),
    ]);

  return {
    filters: { status, q },
    total,
    synced,
    failed,
    pending,
    matchingTotal,
    latestSyncAt: latestSync._max.hermesSyncedAt?.toISOString() ?? null,
    products: products.map((product) => ({
      id: product.id,
      productGid: product.productGid,
      title: product.title,
      handle: product.handle,
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

  try {
    if (intent === "sync") {
      const result = await syncAllPublishedProducts(admin, session.shop);
      const failed = await prisma.productSnapshot.count({
        where: { shop: session.shop, hermesSyncStatus: "FAILED" },
      });
      return { ok: true as const, intent, synced: result.synced, failed };
    }

    if (intent === "retry_product") {
      const productGid = formData.get("productGid")?.toString();
      if (!productGid) return { error: "missing_product" };
      const product = await syncProductByGid(session.shop, productGid);
      const failed = await prisma.productSnapshot.count({
        where: { shop: session.shop, hermesSyncStatus: "FAILED" },
      });
      return {
        ok: true as const,
        intent,
        synced: product ? 1 : 0,
        failed,
        productTitle: product?.title ?? "",
      };
    }

    if (intent === "retry_failed") {
      const failedProducts = await prisma.productSnapshot.findMany({
        where: { shop: session.shop, hermesSyncStatus: "FAILED" },
        select: { productGid: true },
        orderBy: { updatedAt: "desc" },
      });
      let attempted = 0;

      for (const product of failedProducts) {
        try {
          await syncProductByGid(session.shop, product.productGid);
          attempted += 1;
        } catch (error) {
          console.error("[Retry failed product sync failed]", {
            shop: session.shop,
            productGid: product.productGid,
            error,
          });
        }
      }

      const failed = await prisma.productSnapshot.count({
        where: { shop: session.shop, hermesSyncStatus: "FAILED" },
      });
      return { ok: true as const, intent, attempted, synced: attempted, failed };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "商品同步失败。",
      intent: intent || "unknown",
    };
  }

  return { error: "unknown_intent" };
};

export default function ProductsPage() {
  const { filters, total, synced, failed, pending, matchingTotal, latestSyncAt, products } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const lastData = useRef<typeof fetcher.data>(undefined);
  const [statusValue, setStatusValue] = useState<string>(filters.status);
  const [queryValue, setQueryValue] = useState<string>(filters.q);
  const busy = fetcher.state !== "idle";
  const activeIntent = fetcher.formData?.get("intent")?.toString();
  const syncingAll = busy && activeIntent === "sync";
  const retryingFailed = busy && activeIntent === "retry_failed";

  useEffect(() => {
    setStatusValue(filters.status);
    setQueryValue(filters.q);
  }, [filters.status, filters.q]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    const data = fetcher.data;
    if (!data || data === lastData.current) return;
    lastData.current = data;
    if ("ok" in data) {
      const productTitle = "productTitle" in data ? data.productTitle : "";
      const attempted = "attempted" in data ? data.attempted : data.synced;
      const prefix =
        data.intent === "retry_product" && productTitle
          ? `已重试 ${productTitle}`
          : data.intent === "retry_failed"
            ? `已批量重试 ${attempted} 个失败商品`
          : `已同步 ${data.synced} 个商品`;
      shopify.toast.show(`${prefix}，当前失败 ${data.failed} 个。`);
    } else {
      shopify.toast.show(data.error || "商品同步失败。", { isError: true });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const currentListLabel =
    filters.status === "failed"
      ? "同步失败商品"
      : filters.status === "pending"
        ? "等待同步商品"
        : filters.status === "synced"
          ? "已同步商品"
          : "最近商品";

  return (
    <Page
      title="商品知识库"
      primaryAction={{
        content: "同步已发布商品",
        onAction: () => fetcher.submit({ intent: "sync" }, { method: "post" }),
        loading: syncingAll,
      }}
    >
      <TitleBar title="商品知识库" />
      <BlockStack gap="400">
        <InlineStack gap="300" wrap>
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
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="start" gap="300" wrap>
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    同步状态
                  </Text>
                  {failed > 0 ? (
                    <Badge tone="critical">{`${failed} 个失败待排查`}</Badge>
                  ) : (
                    <Badge tone="success">暂无失败</Badge>
                  )}
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  最近成功同步：
                  {latestSyncAt ? new Date(latestSyncAt).toLocaleString() : "暂无"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  当前列表：{currentListLabel}，共 {matchingTotal} 个匹配结果。
                </Text>
              </BlockStack>
              <InlineStack gap="200">
                <Button
                  onClick={() =>
                    fetcher.submit({ intent: "retry_failed" }, { method: "post" })
                  }
                  disabled={failed === 0}
                  loading={retryingFailed}
                >
                  批量重试失败
                </Button>
                <Button url={productsUrl("failed", filters.q)} disabled={filters.status === "failed"}>
                  只看失败
                </Button>
                <Button url="/app/products" disabled={filters.status === "all" && !filters.q}>
                  显示全部
                </Button>
              </InlineStack>
            </InlineStack>

            <Form method="get">
              <InlineStack gap="300" blockAlign="end" wrap>
                <div style={{ minWidth: 180 }}>
                  <Select
                    label="同步状态"
                    name="status"
                    options={statusOptions}
                    value={statusValue}
                    onChange={setStatusValue}
                  />
                </div>
                <div style={{ flex: "1 1 280px", minWidth: 240 }}>
                  <TextField
                    label="搜索商品"
                    name="q"
                    value={queryValue}
                    onChange={setQueryValue}
                    autoComplete="off"
                    placeholder="商品标题、handle 或错误内容"
                  />
                </div>
                <InlineStack gap="200">
                  <Button submit variant="primary">
                    筛选
                  </Button>
                  <Button url="/app/products">重置</Button>
                </InlineStack>
              </InlineStack>
            </Form>
          </BlockStack>
        </Card>

        <Card padding="0">
          {products.length === 0 ? (
            <Box padding="600">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  没有匹配的商品
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  调整筛选条件，或点击“同步已发布商品”刷新商品知识库。
                </Text>
              </BlockStack>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "商品", plural: "商品" }}
              itemCount={products.length}
              headings={[
                { title: "商品" },
                { title: "销售状态" },
                { title: "价格" },
                { title: "Hermes" },
                { title: "更新时间" },
                { title: "" },
              ]}
              selectable={false}
            >
              {products.map((product, index) => (
                <IndexTable.Row
                  id={product.id}
                  key={product.id}
                  position={index}
                  tone={product.hermesSyncStatus === "FAILED" ? "critical" : undefined}
                >
                  <IndexTable.Cell>
                    <BlockStack gap="100">
                      <Text as="span" fontWeight="semibold">
                        {product.title}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {product.handle}
                      </Text>
                      {product.hermesError ? (
                        <BlockStack gap="100">
                          <Text as="span" variant="bodySm" tone="critical">
                            {shortError(product.hermesError)}
                          </Text>
                          <details>
                            <summary style={{ cursor: "pointer" }}>查看完整错误</summary>
                            <Box paddingBlockStart="100">
                              <Text as="p" variant="bodySm" tone="subdued">
                                {product.hermesError}
                              </Text>
                            </Box>
                          </details>
                        </BlockStack>
                      ) : null}
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={product.available && product.published ? "success" : "critical"}>
                      {product.available && product.published ? "可售" : "不可售"}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {product.price
                      ? `${product.price} ${product.currencyCode || ""}`.trim()
                      : "-"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={statusTone(product.hermesSyncStatus)}>
                      {product.hermesSyncStatus === "PENDING" && product.hermesError
                        ? "自动重试中"
                        : productSyncStatusLabel(product.hermesSyncStatus)}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {new Date(product.updatedAt).toLocaleString()}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="200" align="end">
                      {product.hermesSyncStatus === "FAILED" ? (
                        <Button
                          onClick={() =>
                            fetcher.submit(
                              {
                                intent: "retry_product",
                                productGid: product.productGid,
                              },
                              { method: "post" },
                            )
                          }
                          loading={
                            busy &&
                            fetcher.formData?.get("productGid") === product.productGid
                          }
                        >
                          重试同步
                        </Button>
                      ) : null}
                      {product.hermesError ? (
                        <Button
                          onClick={() => {
                            void navigator.clipboard?.writeText(product.hermesError || "");
                            shopify.toast.show("错误信息已复制。");
                          }}
                        >
                          复制错误
                        </Button>
                      ) : null}
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
