import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

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

  const recent = conversations.slice(0, 5).map((c) => ({
    id: c.id,
    visitorId: c.visitorId,
    preview: c.messages[0]?.body ?? "",
    updatedAt: c.updatedAt.toISOString(),
  }));

  return {
    total: conversations.length,
    recent,
  };
};

export default function Index() {
  const { total, recent } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="客服概览" />
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="400">
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" tone="subdued">
                会话总数
              </Text>
              <Text as="p" variant="heading2xl">
                {total}
              </Text>
            </BlockStack>
            <Button url="/app/conversations" variant="primary">
              打开会话列表
            </Button>
          </InlineStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              最近会话
            </Text>
            {recent.length === 0 ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                暂无访客会话。在主题编辑器中启用「在线客服」应用嵌入后，访客消息会显示在这里。
              </Text>
            ) : (
              <BlockStack gap="200">
                {recent.map((c) => (
                  <Box
                    key={c.id}
                    padding="300"
                    borderRadius="200"
                    background="bg-surface-secondary"
                  >
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          访客 {c.visitorId.slice(0, 8)}…
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {c.preview || "（无消息）"}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          更新于 {new Date(c.updatedAt).toLocaleString()}
                        </Text>
                      </BlockStack>
                      <Link to={`/app/conversations/${c.id}`}>打开</Link>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
