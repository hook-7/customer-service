import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  BlockStack,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { listConversationsForShop } from "../models/chat.server";
import { authenticate } from "../shopify.server";

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversations = await listConversationsForShop(session.shop);
  const products = await prisma.productSnapshot.count({
    where: { shop: session.shop },
  });
  const failedProducts = await prisma.productSnapshot.count({
    where: { shop: session.shop, hermesSyncStatus: "FAILED" },
  });

  return {
    totalConversations: conversations.length,
    productSnapshots: products,
    failedProducts,
    recent: conversations.slice(0, 5).map((c) => ({
      id: c.id,
      visitorId: c.visitorId,
      preview: c.messages[0]?.body ?? "",
      updatedAt: c.updatedAt.toISOString(),
    })),
  };
};

export default function Index() {
  const { totalConversations, productSnapshots, failedProducts, recent } =
    useLoaderData<typeof loader>();

  return (
    <Page title="AI 客服控制台">
      <TitleBar title="AI 客服控制台" />
      <BlockStack gap="400">
        <InlineStack gap="400">
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                客服会话
              </Text>
              <Text as="p" variant="heading2xl">
                {totalConversations}
              </Text>
              <Button url="/app/conversations">查看会话</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                商品知识
              </Text>
              <Text as="p" variant="heading2xl">
                {productSnapshots}
              </Text>
              <Button url="/app/products">管理商品知识库</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                同步失败
              </Text>
              <Text as="p" variant="heading2xl">
                {failedProducts}
              </Text>
            </BlockStack>
          </Card>
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              最近会话
            </Text>
            {recent.length === 0 ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                暂无会话。顾客在店铺聊天框发消息后会出现在这里。
              </Text>
            ) : (
              <BlockStack gap="200">
                {recent.map((c) => (
                  <InlineStack key={c.id} align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        访客 {c.visitorId.slice(0, 8)}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {c.preview || "暂无消息"}
                      </Text>
                    </BlockStack>
                    <Link to={`/app/conversations/${c.id}`}>打开</Link>
                  </InlineStack>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
