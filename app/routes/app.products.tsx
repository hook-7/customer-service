import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "@remix-run/node";
import {
  Form,
  useFetcher,
  useLoaderData,
  useRouteError,
} from "@remix-run/react";
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
  Text,
  TextField,
} from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";

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
  const q = url.searchParams.get("q")?.trim() ?? "";

  const where: Prisma.ProductSnapshotWhereInput = { shop: session.shop };
  if (q) {
    where.OR = [
      { title: { contains: q } },
      { handle: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const [products, total, available, matchingTotal, latestUpdate] =
    await Promise.all([
      prisma.productSnapshot.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 50,
      }),
      prisma.productSnapshot.count({ where: { shop: session.shop } }),
      prisma.productSnapshot.count({
        where: { shop: session.shop, available: true, published: true },
      }),
      prisma.productSnapshot.count({ where }),
      prisma.productSnapshot.aggregate({
        where: { shop: session.shop },
        _max: { updatedAt: true },
      }),
    ]);

  return {
    filters: { q },
    total,
    available,
    unavailable: total - available,
    matchingTotal,
    latestUpdateAt: latestUpdate._max.updatedAt?.toISOString() ?? null,
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      available: product.available,
      published: product.published,
      price: product.price,
      currencyCode: product.currencyCode,
      sourceUpdatedAt: product.sourceUpdatedAt?.toISOString() ?? null,
      updatedAt: product.updatedAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString();

  if (intent !== "sync") return { error: "unknown_intent" };

  try {
    const result = await syncAllPublishedProducts(admin, session.shop);
    return { ok: true as const, synced: result.synced };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "商品同步失败。",
    };
  }
};

export default function ProductsPage() {
  const {
    filters,
    total,
    available,
    unavailable,
    matchingTotal,
    latestUpdateAt,
    products,
  } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const lastData = useRef<typeof fetcher.data>(undefined);
  const [queryValue, setQueryValue] = useState(filters.q);
  const syncing = fetcher.state !== "idle";

  useEffect(() => {
    setQueryValue(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    const data = fetcher.data;
    if (!data || data === lastData.current) return;
    lastData.current = data;
    if ("ok" in data) {
      shopify.toast.show(`已刷新 ${data.synced} 个商品快照。`);
    } else {
      shopify.toast.show(data.error || "商品同步失败。", { isError: true });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  return (
    <Page
      title="商品知识库"
      primaryAction={{
        content: "刷新已发布商品",
        onAction: () => fetcher.submit({ intent: "sync" }, { method: "post" }),
        loading: syncing,
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
                AI 可推荐
              </Text>
              <Text as="p" variant="headingLg">
                {available}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">
                不可售
              </Text>
              <Text as="p" variant="headingLg">
                {unavailable}
              </Text>
            </BlockStack>
          </Card>
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <InlineStack
              align="space-between"
              blockAlign="start"
              gap="300"
              wrap
            >
              <BlockStack gap="100">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    本地商品上下文
                  </Text>
                  <Badge tone="success">直接用于 AI 回答</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  AI 每次回答都会读取当前可售商品快照，不再向外部知识服务同步。
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  最近更新：
                  {latestUpdateAt
                    ? new Date(latestUpdateAt).toLocaleString()
                    : "暂无"}
                  ，当前有 {matchingTotal} 个匹配结果。
                </Text>
              </BlockStack>
              <Button url="/app/products" disabled={!filters.q}>
                显示全部
              </Button>
            </InlineStack>

            <Form method="get">
              <InlineStack gap="300" blockAlign="end" wrap>
                <div style={{ flex: "1 1 320px", minWidth: 260 }}>
                  <TextField
                    label="搜索商品"
                    name="q"
                    value={queryValue}
                    onChange={setQueryValue}
                    autoComplete="off"
                    placeholder="商品标题、handle 或描述"
                  />
                </div>
                <InlineStack gap="200">
                  <Button submit variant="primary">
                    搜索
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
                  调整搜索条件，或点击“刷新已发布商品”更新商品快照。
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
                { title: "Shopify 更新时间" },
                { title: "本地更新时间" },
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
                      <Text as="span" variant="bodySm" tone="subdued">
                        {product.handle}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge
                      tone={
                        product.available && product.published
                          ? "success"
                          : "critical"
                      }
                    >
                      {product.available && product.published
                        ? "可推荐"
                        : "不可售"}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {product.price
                      ? `${product.price} ${product.currencyCode || ""}`.trim()
                      : "-"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {product.sourceUpdatedAt
                      ? new Date(product.sourceUpdatedAt).toLocaleString()
                      : "-"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {new Date(product.updatedAt).toLocaleString()}
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
