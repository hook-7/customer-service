import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  BlockStack,
  Box,
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

  return {
    conversations: conversations.map((c) => ({
      id: c.id,
      visitorId: c.visitorId,
      updatedAt: c.updatedAt.toISOString(),
      preview: c.messages[0]?.body ?? "",
    })),
  };
};

export default function ConversationsIndex() {
  const { conversations } = useLoaderData<typeof loader>();

  return (
    <Page>
      <TitleBar title="客服会话" />
      <BlockStack gap="400">
        {conversations.length === 0 ? (
          <Card>
            <Box padding="600">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  暂无访客会话
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  在主题编辑器中启用「在线客服」应用嵌入后，访客消息会显示在这里。
                </Text>
              </BlockStack>
            </Box>
          </Card>
        ) : (
          conversations.map((c) => (
            <Card key={c.id}>
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
                <Box>
                  <Link to={`/app/conversations/${c.id}`}>打开</Link>
                </Box>
              </InlineStack>
            </Card>
          ))
        )}
      </BlockStack>
    </Page>
  );
}
