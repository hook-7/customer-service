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
  const products = await prisma.productSnapshot.findMany({
    where: { shop: session.shop },
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

  return {
    total,
    synced,
    failed,
    products: products.map((product) => ({
      id: product.id,
      title: product.title,
      available: product.available,
      published: product.published,
      price: product.price,
      currencyCode: product.currencyCode,
      hermesSyncStatus: product.hermesSyncStatus,
      updatedAt: product.updatedAt.toISOString(),
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
  const { total, synced, failed, products } = useLoaderData<typeof loader>();
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
        <InlineStack gap="400">
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
                同步失败
              </Text>
              <Text as="p" variant="headingLg">
                {failed}
              </Text>
            </BlockStack>
          </Card>
        </InlineStack>

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
                <IndexTable.Cell>{product.hermesSyncStatus}</IndexTable.Cell>
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
