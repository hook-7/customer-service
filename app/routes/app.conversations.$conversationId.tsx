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
  BlockStack,
  Box,
  Button,
  Card,
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

  return { ok: true as const };
};

const ERROR_MESSAGES: Record<string, string> = {
  empty: "回复不能为空",
  too_long: "回复超过 2000 字符",
  missing_id: "会话 ID 缺失",
  not_found: "会话不存在",
};

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
    } else if ("error" in data && data.error) {
      const msg = ERROR_MESSAGES[data.error] || "发送失败";
      shopify.toast.show(msg, { isError: true });
    }
  }, [fetcher.state, fetcher.data, shopify]);

  const onDraftChange = useCallback((v: string) => setDraft(v), []);

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (!body.length) return;
    if (busy) return;
    setDraft("");
    atBottomRef.current = true;
    fetcher.submit({ body }, { method: "post" });
  }, [draft, busy, fetcher]);

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

  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    atBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const msgs = conversation.messages;
  const sig =
    msgs.length +
    "|" +
    (msgs.length ? msgs[msgs.length - 1].id : "") +
    "|" +
    (msgs.length ? msgs[msgs.length - 1].createdAt : "");

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (lastSigRef.current === sig) return;
    const firstRender = lastSigRef.current === "";
    lastSigRef.current = sig;
    if (firstRender || atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [sig]);

  return (
    <Page
      backAction={{ content: "会话列表", url: "/app/conversations" }}
      title={`访客 ${conversation.visitorId.slice(0, 8)}…`}
    >
      <TitleBar title="会话详情" />
      <BlockStack gap="400">
        <Card>
          <div
            ref={listRef}
            onScroll={onListScroll}
            style={{
              maxHeight: "55vh",
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            <BlockStack gap="300">
              {msgs.length === 0 ? (
                <Text as="p" variant="bodyMd" tone="subdued">
                  暂无消息
                </Text>
              ) : (
                msgs.map((m) => (
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
                label="回复"
                value={draft}
                onChange={onDraftChange}
                multiline={4}
                autoComplete="off"
                disabled={busy}
                helpText="Ctrl/Cmd + Enter 快速发送"
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
