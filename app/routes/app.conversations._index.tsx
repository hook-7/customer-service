import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
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
import { TitleBar } from "@shopify/app-bridge-react";
import { useState } from "react";

import prisma from "../db.server";
import {
  listConversationInbox,
  listTagsForShop,
  parseAiFilter,
  parseConversationStatus,
} from "../models/chat.server";
import { authenticate } from "../shopify.server";

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = parseConversationStatus(url.searchParams.get("status"));
  const ai = parseAiFilter(url.searchParams.get("ai"));
  const tag = url.searchParams.get("tag")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);

  const [inbox, allTags, pendingCount, handledCount] = await Promise.all([
    listConversationInbox(session.shop, { status, ai, tag, q, page }),
    listTagsForShop(session.shop),
    prisma.conversation.count({
      where: { shop: session.shop, status: "PENDING" },
    }),
    prisma.conversation.count({
      where: { shop: session.shop, status: "HANDLED" },
    }),
  ]);

  return {
    conversations: inbox.conversations.map((c) => ({
      id: c.id,
      visitorId: c.visitorId,
      status: c.status,
      aiEnabled: c.aiEnabled,
      updatedAt: (c.lastMessageAt ?? c.updatedAt).toISOString(),
      preview: c.lastMessagePreview ?? "",
      sender: c.lastMessageSender,
      tags: c.tags.map((tag) => tag.label),
    })),
    filters: { status, ai, tag, q },
    allTags,
    page: inbox.page,
    totalPages: inbox.totalPages,
    total: inbox.total,
    pendingCount,
    handledCount,
  };
};

function statusLabel(status: string) {
  return status === "PENDING" ? "待处理" : "已处理";
}

function senderLabel(sender: string | null) {
  if (sender === "VISITOR") return "访客";
  if (sender === "AI") return "AI 客服";
  if (sender === "STAFF") return "人工客服";
  return "暂无消息";
}

function pageUrl(
  page: number,
  filters: { status: string; ai: string; tag: string; q: string },
) {
  const params = new URLSearchParams();
  if (filters.status !== "ALL") params.set("status", filters.status);
  if (filters.ai !== "all") params.set("ai", filters.ai);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.q) params.set("q", filters.q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/app/conversations?${qs}` : "/app/conversations";
}

export default function ConversationsIndex() {
  const {
    conversations,
    filters,
    allTags,
    page,
    totalPages,
    total,
    pendingCount,
    handledCount,
  } = useLoaderData<typeof loader>();
  const [statusValue, setStatusValue] = useState<string>(filters.status);
  const [aiValue, setAiValue] = useState<string>(filters.ai);
  const [tagValue, setTagValue] = useState<string>(filters.tag);
  const [queryValue, setQueryValue] = useState<string>(filters.q);

  const statusOptions = [
    { label: "全部状态", value: "ALL" },
    { label: `待处理 (${pendingCount})`, value: "PENDING" },
    { label: `已处理 (${handledCount})`, value: "HANDLED" },
  ];
  const aiOptions = [
    { label: "全部 AI 状态", value: "all" },
    { label: "AI 开启", value: "on" },
    { label: "AI 暂停", value: "off" },
  ];
  const tagOptions = [
    { label: "全部标签", value: "" },
    ...allTags.map((tag) => ({ label: tag, value: tag })),
  ];

  return (
    <Page
      title="客服工作台"
      primaryAction={{
        content: "待处理会话",
        url: "/app/conversations?status=PENDING",
      }}
      secondaryActions={[
        { content: "全部会话", url: "/app/conversations" },
        { content: "AI 暂停", url: "/app/conversations?ai=off" },
      ]}
    >
      <TitleBar title="客服工作台" />
      <BlockStack gap="400">
        <Card>
          <Form method="get">
            <BlockStack gap="300">
              <InlineStack gap="300" blockAlign="end" wrap>
                <div style={{ minWidth: 180 }}>
                  <Select
                    label="处理状态"
                    name="status"
                    options={statusOptions}
                    value={statusValue}
                    onChange={setStatusValue}
                  />
                </div>
                <div style={{ minWidth: 160 }}>
                  <Select
                    label="AI 状态"
                    name="ai"
                    options={aiOptions}
                    value={aiValue}
                    onChange={setAiValue}
                  />
                </div>
                <div style={{ minWidth: 180 }}>
                  <Select
                    label="标签"
                    name="tag"
                    options={tagOptions}
                    value={tagValue}
                    onChange={setTagValue}
                  />
                </div>
                <div style={{ minWidth: 260, flex: "1 1 260px" }}>
                  <TextField
                    label="搜索"
                    name="q"
                    value={queryValue}
                    onChange={setQueryValue}
                    autoComplete="off"
                    placeholder="访客 ID 或消息内容"
                  />
                </div>
                <InlineStack gap="200">
                  <Button submit variant="primary">
                    筛选
                  </Button>
                  <Button url="/app/conversations">重置</Button>
                </InlineStack>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                默认按待处理优先，再按最近消息时间倒序排列。当前结果 {total} 个。
              </Text>
            </BlockStack>
          </Form>
        </Card>

        <Card padding="0">
          {conversations.length === 0 ? (
            <Box padding="600">
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">
                  没有匹配的会话
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  调整筛选条件，或等待顾客在店铺聊天框发送新消息。
                </Text>
              </BlockStack>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "会话", plural: "会话" }}
              itemCount={conversations.length}
              selectable={false}
              headings={[
                { title: "访客" },
                { title: "状态" },
                { title: "AI" },
                { title: "最后消息" },
                { title: "标签" },
                { title: "更新时间" },
                { title: "" },
              ]}
            >
              {conversations.map((c, index) => (
                <IndexTable.Row id={c.id} key={c.id} position={index}>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">
                      访客 {c.visitorId.slice(0, 8)}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={c.status === "PENDING" ? "critical" : "success"}>
                      {statusLabel(c.status)}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={c.aiEnabled ? "success" : "critical"}>
                      {c.aiEnabled ? "开启" : "暂停"}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="100">
                      <Text as="span" variant="bodySm" tone="subdued">
                        {senderLabel(c.sender)}
                      </Text>
                      <Text as="span" variant="bodyMd">
                        {c.preview || "暂无消息"}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="100">
                      {c.tags.length ? (
                        c.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)
                      ) : (
                        <Text as="span" variant="bodySm" tone="subdued">
                          -
                        </Text>
                      )}
                    </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {new Date(c.updatedAt).toLocaleString()}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Link to={`/app/conversations/${c.id}`}>打开</Link>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

        {totalPages > 1 ? (
          <InlineStack align="center" gap="300" blockAlign="center">
            <Button disabled={page <= 1} url={pageUrl(page - 1, filters)}>
              上一页
            </Button>
            <Text as="p" variant="bodySm" tone="subdued">
              第 {page} / {totalPages} 页
            </Text>
            <Button disabled={page >= totalPages} url={pageUrl(page + 1, filters)}>
              下一页
            </Button>
          </InlineStack>
        ) : null}
      </BlockStack>
    </Page>
  );
}
