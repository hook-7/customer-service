import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  useFetcher,
  useLoaderData,
  useRevalidator,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ProductRecommendationMetadata } from "../models/chat.server";
import {
  appendMessage,
  getConversationForShop,
  serializeMessage,
  setConversationAiEnabled,
} from "../models/chat.server";
import { authenticate } from "../shopify.server";

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId;
  if (!conversationId) throw redirect("/app/conversations");

  const conversation = await getConversationForShop(session.shop, conversationId);
  if (!conversation) throw redirect("/app/conversations");

  return {
    conversation: {
      id: conversation.id,
      visitorId: conversation.visitorId,
      aiEnabled: conversation.aiEnabled,
      messages: conversation.messages.map(serializeMessage),
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const conversationId = params.conversationId;
  if (!conversationId) return { error: "missing_id" };

  const conversation = await getConversationForShop(session.shop, conversationId);
  if (!conversation) return { error: "not_found" };

  const formData = await request.formData();
  const intent = formData.get("intent")?.toString() || "send";

  if (intent === "toggle_ai") {
    const enabled = formData.get("aiEnabled") === "true";
    await setConversationAiEnabled(session.shop, conversation.id, enabled);
    return { ok: true as const };
  }

  const body = formData.get("body")?.toString().trim() ?? "";
  if (!body.length) return { error: "empty" };
  if (body.length > 2000) return { error: "too_long" };

  await appendMessage(conversation.id, "STAFF", body);
  return { ok: true as const };
};

const ERROR_MESSAGES: Record<string, string> = {
  empty: "请输入回复内容。",
  too_long: "回复内容不能超过 2000 字。",
  missing_id: "会话 ID 缺失。",
  not_found: "会话不存在。",
};

function senderLabel(sender: string) {
  if (sender === "VISITOR") return "访客";
  if (sender === "AI") return "AI 客服";
  return "人工客服";
}

function ProductCards({ metadata }: { metadata: unknown }) {
  const data =
    metadata && typeof metadata === "object"
      ? (metadata as ProductRecommendationMetadata)
      : null;
  const products = data?.products || [];

  if (!products.length) return null;

  return (
    <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="300">
      {products.map((product) => (
        <Box
          key={product.productGid}
          padding="300"
          borderRadius="200"
          background="bg-surface-secondary"
        >
          <BlockStack gap="200">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.title}
                style={{
                  width: "100%",
                  aspectRatio: "4 / 3",
                  objectFit: "cover",
                  borderRadius: 6,
                }}
              />
            ) : null}
            <Text as="h3" variant="headingSm">
              {product.title}
            </Text>
            {product.price ? (
              <Text as="p" variant="bodySm" tone="subdued">
                {product.price} {product.currencyCode || ""}
              </Text>
            ) : null}
            {product.reason ? (
              <Text as="p" variant="bodySm">
                {product.reason}
              </Text>
            ) : null}
            <Badge tone={product.available ? "success" : "critical"}>
              {product.available ? "可加购" : "不可售"}
            </Badge>
          </BlockStack>
        </Box>
      ))}
    </InlineGrid>
  );
}

export default function ConversationDetail() {
  const { conversation } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [draft, setDraft] = useState("");
  const busy = fetcher.state !== "idle";

  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastSigRef = useRef("");
  const lastFetcherDataRef = useRef<typeof fetcher.data>(undefined);

  useEffect(() => {
    const id = setInterval(() => {
      if (fetcher.state === "idle" && revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [fetcher.state, revalidator]);

  useEffect(() => {
    if (fetcher.state !== "idle") return;
    const data = fetcher.data;
    if (!data || data === lastFetcherDataRef.current) return;
    lastFetcherDataRef.current = data;
    if ("ok" in data) {
      atBottomRef.current = true;
      revalidator.revalidate();
    } else if ("error" in data && data.error) {
      shopify.toast.show(ERROR_MESSAGES[data.error] || "操作失败。", {
        isError: true,
      });
    }
  }, [fetcher.state, fetcher.data, shopify, revalidator]);

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (!body.length || busy) return;
    setDraft("");
    atBottomRef.current = true;
    fetcher.submit({ body, intent: "send" }, { method: "post" });
  }, [draft, busy, fetcher]);

  const toggleAi = useCallback(() => {
    fetcher.submit(
      {
        intent: "toggle_ai",
        aiEnabled: String(!conversation.aiEnabled),
      },
      { method: "post" },
    );
  }, [conversation.aiEnabled, fetcher]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== "TEXTAREA" && target.tagName !== "INPUT") return;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const msgs = conversation.messages;
  const sig =
    msgs.length +
    "|" +
    (msgs.length ? msgs[msgs.length - 1].id : "") +
    "|" +
    (msgs.length ? msgs[msgs.length - 1].createdAt : "");

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || lastSigRef.current === sig) return;
    const firstRender = lastSigRef.current === "";
    lastSigRef.current = sig;
    if (firstRender || atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [sig]);

  return (
    <Page
      backAction={{ content: "会话列表", url: "/app/conversations" }}
      title={`访客 ${conversation.visitorId.slice(0, 8)}`}
      primaryAction={{
        content: conversation.aiEnabled ? "关闭 AI" : "开启 AI",
        onAction: toggleAi,
        loading: busy,
      }}
    >
      <TitleBar title="客服会话" />
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <Text as="p" variant="bodyMd">
              AI 自动回复当前为
            </Text>
            <Badge tone={conversation.aiEnabled ? "success" : "critical"}>
              {conversation.aiEnabled ? "已开启" : "已关闭"}
            </Badge>
          </InlineStack>
        </Card>

        <Card>
          <div
            ref={listRef}
            style={{
              maxHeight: "55vh",
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
            onScroll={() => {
              const el = listRef.current;
              if (!el) return;
              atBottomRef.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
          >
            <BlockStack gap="300">
              {msgs.length === 0 ? (
                <Text as="p" variant="bodyMd" tone="subdued">
                  还没有消息。
                </Text>
              ) : (
                msgs.map((m) => (
                  <Box
                    key={m.id}
                    padding="300"
                    background={
                      m.sender === "VISITOR" ? undefined : "bg-surface-secondary"
                    }
                    borderRadius="200"
                  >
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued">
                        {senderLabel(m.sender)} ·{" "}
                        {new Date(m.createdAt).toLocaleString()}
                      </Text>
                      {m.kind === "PRODUCT_RECOMMENDATION" ? (
                        <ProductCards metadata={m.metadata} />
                      ) : (
                        <Text as="p" variant="bodyMd">
                          {m.body}
                        </Text>
                      )}
                    </BlockStack>
                  </Box>
                ))
              )}
            </BlockStack>
          </div>
        </Card>

        <div
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 1,
            background: "var(--p-color-bg, #f1f1f1)",
            paddingBlock: "8px",
          }}
          onKeyDown={onKeyDown}
        >
          <Card>
            <BlockStack gap="300">
              <TextField
                label="人工回复"
                value={draft}
                onChange={setDraft}
                multiline={4}
                autoComplete="off"
                disabled={busy}
                helpText="Ctrl/Cmd + Enter 发送。人工回复不会关闭 AI，可用右上角按钮单独关闭。"
              />
              <InlineStack>
                <Button
                  onClick={handleSend}
                  variant="primary"
                  loading={busy}
                  disabled={busy || !draft.trim().length}
                >
                  发送回复
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </div>
      </BlockStack>
    </Page>
  );
}
