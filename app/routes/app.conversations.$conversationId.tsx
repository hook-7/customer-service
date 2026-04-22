import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  Form,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useCallback, useEffect, useState } from "react";

import {
  appendMessage,
  getConversationForShop,
} from "../models/chat.server";
import { authenticate } from "../shopify.server";

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const loader = async ({
  request,
  params,
}: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId;
  if (!conversationId) {
    throw redirect("/app/conversations");
  }

  const conversation = await getConversationForShop(
    session.shop,
    conversationId,
  );

  if (!conversation) {
    throw redirect("/app/conversations");
  }

  return {
    conversation: {
      id: conversation.id,
      visitorId: conversation.visitorId,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
    },
  };
};

export const action = async ({
  request,
  params,
}: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId;
  if (!conversationId) {
    return { error: "missing_id" };
  }

  const conversation = await getConversationForShop(
    session.shop,
    conversationId,
  );
  if (!conversation) {
    return { error: "not_found" };
  }

  const formData = await request.formData();
  const body = formData.get("body")?.toString().trim() ?? "";
  if (!body.length) {
    return { error: "empty" };
  }
  if (body.length > 2000) {
    return { error: "too_long" };
  }

  await appendMessage(conversation.id, "STAFF", body);

  return redirect(`/app/conversations/${conversationId}`);
};

export default function ConversationDetail() {
  const { conversation } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const [draft, setDraft] = useState("");
  const busy = navigation.state !== "idle";

  useEffect(() => {
    const id = setInterval(() => {
      if (navigation.state === "idle") revalidator.revalidate();
    }, 4000);
    return () => clearInterval(id);
  }, [navigation.state, revalidator]);

  const onDraftChange = useCallback((v: string) => setDraft(v), []);

  return (
    <Page
      backAction={{ content: "会话列表", url: "/app/conversations" }}
      title={`访客 ${conversation.visitorId.slice(0, 8)}…`}
    >
      <TitleBar title="会话详情" />
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            {conversation.messages.length === 0 ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                暂无消息
              </Text>
            ) : (
              conversation.messages.map((m) => (
                <Box
                  key={m.id}
                  padding="200"
                  background={
                    m.sender === "STAFF" ? "bg-surface-secondary" : undefined
                  }
                  borderRadius="200"
                >
                  <Text as="p" variant="bodySm" tone="subdued">
                    {m.sender === "STAFF" ? "客服" : "访客"} ·{" "}
                    {new Date(m.createdAt).toLocaleString()}
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {m.body}
                  </Text>
                </Box>
              ))
            )}
          </BlockStack>
        </Card>
        <Card>
          <Form method="post">
            <BlockStack gap="300">
              <TextField
                label="回复"
                name="body"
                value={draft}
                onChange={onDraftChange}
                multiline={4}
                autoComplete="off"
              />
              <InlineStack>
                <Button submit variant="primary" loading={busy} disabled={busy}>
                  发送回复
                </Button>
              </InlineStack>
            </BlockStack>
          </Form>
        </Card>
      </BlockStack>
    </Page>
  );
}
