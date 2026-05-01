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

import type {
  ConversationStatus,
  ProductRecommendationMetadata,
} from "../models/chat.server";
import {
  addConversationTag,
  appendMessage,
  getConversationForShop,
  isValidClientMessageId,
  removeConversationTag,
  serializeMessage,
  setConversationAiEnabled,
  setConversationStatus,
  updateConversationNote,
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
      status: conversation.status,
      internalNote: conversation.internalNote ?? "",
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      updatedAt: conversation.updatedAt.toISOString(),
      tags: conversation.tags.map((tag) => tag.label),
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
    return { ok: true as const, intent };
  }

  if (intent === "set_status") {
    const status = formData.get("status")?.toString();
    if (status !== "PENDING" && status !== "HANDLED") {
      return { error: "invalid_status" };
    }
    await setConversationStatus(session.shop, conversation.id, status);
    return { ok: true as const, intent };
  }

  if (intent === "save_note") {
    const note = formData.get("note")?.toString() ?? "";
    if (note.length > 4000) return { error: "note_too_long" };
    await updateConversationNote(session.shop, conversation.id, note);
    return { ok: true as const, intent };
  }

  if (intent === "add_tag") {
    const tag = normalizeTagInput(formData.get("tag")?.toString() ?? "");
    if (!tag) return { error: "tag_empty" };
    await addConversationTag(session.shop, conversation.id, tag);
    return { ok: true as const, intent };
  }

  if (intent === "remove_tag") {
    const tag = normalizeTagInput(formData.get("tag")?.toString() ?? "");
    if (!tag) return { error: "tag_empty" };
    await removeConversationTag(session.shop, conversation.id, tag);
    return { ok: true as const, intent };
  }

  const body = formData.get("body")?.toString().trim() ?? "";
  const clientMessageId = formData.get("clientMessageId")?.toString() ?? "";
  if (!body.length) return { error: "empty" };
  if (body.length > 2000) return { error: "too_long" };
  if (!isValidClientMessageId(clientMessageId)) {
    return { error: "invalid_client_message_id" };
  }

  const message = await appendMessage(
    conversation.id,
    "STAFF",
    body,
    "TEXT",
    undefined,
    { clientMessageId },
  );
  return { ok: true as const, intent: "send", message: serializeMessage(message) };
};

const ERROR_MESSAGES: Record<string, string> = {
  empty: "请输入回复内容。",
  too_long: "回复内容不能超过 2000 字。",
  missing_id: "会话 ID 缺失。",
  not_found: "会话不存在。",
  invalid_status: "会话状态无效。",
  note_too_long: "内部备注不能超过 4000 字。",
  tag_empty: "请输入标签名称。",
  invalid_client_message_id: "消息 ID 无效，请重试。",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  send: "已发送回复，并自动暂停 AI。",
  toggle_ai: "AI 状态已更新。",
  set_status: "会话状态已更新。",
  save_note: "内部备注已保存。",
  add_tag: "标签已添加。",
  remove_tag: "标签已移除。",
};

function normalizeTagInput(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 32);
}

function senderLabel(sender: string) {
  if (sender === "VISITOR") return "访客";
  if (sender === "AI") return "AI 客服";
  return "人工客服";
}

function statusLabel(status: ConversationStatus) {
  return status === "PENDING" ? "待处理" : "已处理";
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

type DisplayMessage = {
  id: string;
  sender: string;
  kind: string;
  body: string;
  metadata: unknown;
  clientMessageId: string | null;
  createdAt: string;
  optimistic?: boolean;
};

function isOptimisticConfirmed(
  optimistic: DisplayMessage,
  messages: DisplayMessage[],
) {
  if (optimistic.clientMessageId) {
    return messages.some(
      (message) => message.clientMessageId === optimistic.clientMessageId,
    );
  }

  return messages.some((message) => {
    return message.id === optimistic.id;
  });
}

function createClientMessageId() {
  return `staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ConversationDetail() {
  const { conversation } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState(conversation.internalNote);
  const [tagDraft, setTagDraft] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<DisplayMessage[]>([]);
  const activeIntent = fetcher.formData?.get("intent")?.toString() || null;
  const busy = fetcher.state !== "idle";
  const sending = busy && activeIntent === "send";

  const listRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const lastSigRef = useRef("");
  const lastFetcherDataRef = useRef<typeof fetcher.data>(undefined);
  const lastOptimisticBodyRef = useRef("");
  const lastOptimisticClientIdRef = useRef("");

  useEffect(() => {
    setNote(conversation.internalNote);
  }, [conversation.id, conversation.internalNote]);

  useEffect(() => {
    setOptimisticMessages((messages) => {
      const serverMessages = conversation.messages as DisplayMessage[];
      const next = messages.filter(
        (message) => !isOptimisticConfirmed(message, serverMessages),
      );
      return next.length === messages.length ? messages : next;
    });
  }, [conversation.messages]);

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
      if (data.intent === "add_tag") setTagDraft("");
      if (data.intent === "send") {
        lastOptimisticBodyRef.current = "";
        lastOptimisticClientIdRef.current = "";
        if ("message" in data && data.message) {
          setOptimisticMessages((messages) =>
            messages.map((message) =>
              message.clientMessageId === data.message.clientMessageId
                ? { ...(data.message as DisplayMessage), optimistic: false }
                : message,
            ),
          );
        }
      }
      atBottomRef.current = true;
      shopify.toast.show(SUCCESS_MESSAGES[data.intent] || "操作已完成。");
      revalidator.revalidate();
    } else if ("error" in data && data.error) {
      if (lastOptimisticBodyRef.current) {
        setDraft(lastOptimisticBodyRef.current);
        lastOptimisticBodyRef.current = "";
        const failedClientId = lastOptimisticClientIdRef.current;
        lastOptimisticClientIdRef.current = "";
        setOptimisticMessages((messages) =>
          failedClientId
            ? messages.filter(
                (message) => message.clientMessageId !== failedClientId,
              )
            : [],
        );
      }
      shopify.toast.show(ERROR_MESSAGES[data.error] || "操作失败。", {
        isError: true,
      });
    }
  }, [fetcher.state, fetcher.data, shopify, revalidator]);

  const submitStatus = useCallback(
    (status: ConversationStatus) => {
      fetcher.submit({ intent: "set_status", status }, { method: "post" });
    },
    [fetcher],
  );

  const handleSend = useCallback(() => {
    const body = draft.trim();
    if (!body.length || busy) return;
    setDraft("");
    atBottomRef.current = true;
    const clientMessageId = createClientMessageId();
    lastOptimisticBodyRef.current = body;
    lastOptimisticClientIdRef.current = clientMessageId;
    setOptimisticMessages((messages) => [
      ...messages,
      {
        id: clientMessageId,
        clientMessageId,
        sender: "STAFF",
        kind: "TEXT",
        body,
        metadata: null,
        createdAt: new Date().toISOString(),
        optimistic: true,
      },
    ]);
    fetcher.submit(
      { body, clientMessageId, intent: "send" },
      { method: "post" },
    );
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

  const saveNote = useCallback(() => {
    fetcher.submit({ intent: "save_note", note }, { method: "post" });
  }, [fetcher, note]);

  const addTag = useCallback(() => {
    const tag = normalizeTagInput(tagDraft);
    if (!tag || busy) return;
    fetcher.submit({ intent: "add_tag", tag }, { method: "post" });
  }, [busy, fetcher, tagDraft]);

  const removeTag = useCallback(
    (tag: string) => {
      fetcher.submit({ intent: "remove_tag", tag }, { method: "post" });
    },
    [fetcher],
  );

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

  const serverMessages = conversation.messages as DisplayMessage[];
  const pendingOptimisticMessages = optimisticMessages.filter(
    (message) => !isOptimisticConfirmed(message, serverMessages),
  );
  const msgs = [...serverMessages, ...pendingOptimisticMessages];
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
      backAction={{ content: "客服工作台", url: "/app/conversations" }}
      title={`访客 ${conversation.visitorId.slice(0, 8)}`}
      primaryAction={{
        content:
          conversation.status === "PENDING" ? "标为已处理" : "重新标为待处理",
        onAction: () =>
          submitStatus(conversation.status === "PENDING" ? "HANDLED" : "PENDING"),
        loading: busy,
      }}
      secondaryActions={[
        {
          content: conversation.aiEnabled ? "暂停 AI" : "开启 AI",
          onAction: toggleAi,
        },
      ]}
    >
      <TitleBar title="客服会话" />
      <BlockStack gap="400">
        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone={conversation.status === "PENDING" ? "critical" : "success"}>
                  {statusLabel(conversation.status)}
                </Badge>
                <Badge tone={conversation.aiEnabled ? "success" : "critical"}>
                  {`AI ${conversation.aiEnabled ? "开启" : "暂停"}`}
                </Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                人工回复会自动暂停 AI，并将会话标记为已处理。
              </Text>
            </BlockStack>
            <InlineStack gap="200">
              <Button
                onClick={() => submitStatus("PENDING")}
                disabled={busy || conversation.status === "PENDING"}
              >
                重新标为待处理
              </Button>
              <Button
                onClick={() => submitStatus("HANDLED")}
                disabled={busy || conversation.status === "HANDLED"}
                variant="primary"
              >
                标为已处理
              </Button>
            </InlineStack>
          </InlineStack>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  消息记录
                </Text>
                <div
                  ref={listRef}
                  style={{
                    maxHeight: "58vh",
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
                            m.sender === "VISITOR"
                              ? undefined
                              : "bg-surface-secondary"
                          }
                          borderRadius="200"
                        >
                          <BlockStack gap="200">
                            <Text as="p" variant="bodySm" tone="subdued">
                              {senderLabel(m.sender)} ·{" "}
                              {m.optimistic
                                ? "发送中"
                                : new Date(m.createdAt).toLocaleString()}
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
              </BlockStack>
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
                    disabled={busy && !sending}
                    helpText="Ctrl/Cmd + Enter 发送。发送后会自动暂停 AI 并标记为已处理。"
                  />
                  <InlineStack>
                    <Button
                      onClick={handleSend}
                      variant="primary"
                      loading={sending}
                      disabled={busy || !draft.trim().length}
                    >
                      发送回复
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            </div>
          </BlockStack>

          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  会话信息
                </Text>
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      访客 ID
                    </Text>
                    <Text as="p">{conversation.visitorId}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="p" tone="subdued">
                      最近消息
                    </Text>
                    <Text as="p">
                      {new Date(
                        conversation.lastMessageAt ?? conversation.updatedAt,
                      ).toLocaleString()}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  内部备注
                </Text>
                <TextField
                  label="备注"
                  labelHidden
                  value={note}
                  onChange={setNote}
                  multiline={5}
                  autoComplete="off"
                  disabled={busy}
                  placeholder="记录顾客偏好、售后背景或下一步跟进。"
                />
                <InlineStack>
                  <Button
                    onClick={saveNote}
                    loading={busy}
                    disabled={busy || note === conversation.internalNote}
                  >
                    保存备注
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  标签
                </Text>
                {conversation.tags.length ? (
                  <BlockStack gap="200">
                    {conversation.tags.map((tag) => (
                      <InlineStack
                        key={tag}
                        align="space-between"
                        blockAlign="center"
                      >
                        <Badge>{tag}</Badge>
                        <Button
                          onClick={() => removeTag(tag)}
                          disabled={busy}
                        >
                          移除
                        </Button>
                      </InlineStack>
                    ))}
                  </BlockStack>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">
                    暂无标签。
                  </Text>
                )}
                <InlineStack gap="200" blockAlign="end" wrap={false}>
                  <div style={{ flex: "1 1 auto" }}>
                    <TextField
                      label="新增标签"
                      value={tagDraft}
                      onChange={setTagDraft}
                      autoComplete="off"
                      disabled={busy}
                      placeholder="例如：售后、VIP、尺码咨询"
                    />
                  </div>
                  <Button
                    onClick={addTag}
                    disabled={busy || !normalizeTagInput(tagDraft)}
                  >
                    添加
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Page>
  );
}
