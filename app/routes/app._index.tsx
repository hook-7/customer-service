import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Page,
  Text,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

import prisma from "../db.server";
import { listConversationInbox } from "../models/chat.server";
import { authenticate } from "../shopify.server";

type ShopDomainResponse = {
  data?: {
    shop?: {
      myshopifyDomain?: string | null;
      primaryDomain?: {
        url?: string | null;
      } | null;
    } | null;
  };
};

const SHOP_DOMAIN_QUERY = `#graphql
  query ShopDomain {
    shop {
      myshopifyDomain
      primaryDomain {
        url
      }
    }
  }
`;

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let storefrontDomain = `https://${session.shop}`;
  try {
    const response = await admin.graphql(SHOP_DOMAIN_QUERY);
    const data = (await response.json()) as ShopDomainResponse;
    storefrontDomain =
      data.data?.shop?.primaryDomain?.url?.replace(/\/+$/, "") ||
      `https://${data.data?.shop?.myshopifyDomain || session.shop}`;
  } catch {
    storefrontDomain = `https://${session.shop}`;
  }

  const [
    totalConversations,
    pendingConversations,
    handledConversations,
    pausedAiConversations,
    productSnapshots,
    failedProducts,
    recentInbox,
  ] = await Promise.all([
    prisma.conversation.count({ where: { shop: session.shop } }),
    prisma.conversation.count({
      where: { shop: session.shop, status: "PENDING" },
    }),
    prisma.conversation.count({
      where: { shop: session.shop, status: "HANDLED" },
    }),
    prisma.conversation.count({
      where: { shop: session.shop, aiEnabled: false },
    }),
    prisma.productSnapshot.count({ where: { shop: session.shop } }),
    prisma.productSnapshot.count({
      where: { shop: session.shop, hermesSyncStatus: "FAILED" },
    }),
    listConversationInbox(session.shop, { pageSize: 5 }),
  ]);

  const nextAction =
    pendingConversations > 0
      ? {
          title: "优先处理待处理会话",
          body: `当前有 ${pendingConversations} 个顾客会话等待人工确认，建议先进入客服工作台处理。`,
          action: "处理会话",
          url: "/app/conversations?status=PENDING",
          tone: "critical" as const,
        }
      : failedProducts > 0
        ? {
            title: "排查商品同步失败",
            body: `当前有 ${failedProducts} 个商品未同步到 Hermes，可能影响 AI 推荐准确性。`,
            action: "排查商品",
            url: "/app/products?status=failed",
            tone: "critical" as const,
          }
        : pausedAiConversations > 0
          ? {
              title: "检查 AI 暂停会话",
              body: `当前有 ${pausedAiConversations} 个会话处于 AI 暂停状态，确认是否需要重新开启。`,
              action: "查看接管会话",
              url: "/app/conversations?ai=off",
              tone: "attention" as const,
            }
          : {
              title: "后台运行正常",
              body: "暂无待处理会话和商品同步异常，可以从最近会话继续巡检服务质量。",
              action: "进入工作台",
              url: "/app/conversations",
              tone: "success" as const,
            };

  return {
    totalConversations,
    pendingConversations,
    handledConversations,
    pausedAiConversations,
    productSnapshots,
    failedProducts,
    domainConfig: {
      shopDomain: session.shop,
      storefrontDomain,
      appProxyBaseUrl: `${storefrontDomain}/apps/cs`,
      conversationApiPattern: `${storefrontDomain}/apps/cs/conversation/{visitorId}`,
    },
    nextAction,
    recent: recentInbox.conversations.map((c) => ({
      id: c.id,
      visitorId: c.visitorId,
      status: c.status,
      aiEnabled: c.aiEnabled,
      preview: c.lastMessagePreview ?? "",
      updatedAt: (c.lastMessageAt ?? c.updatedAt).toISOString(),
    })),
  };
};

export default function Index() {
  const {
    totalConversations,
    pendingConversations,
    handledConversations,
    pausedAiConversations,
    productSnapshots,
    failedProducts,
    domainConfig,
    nextAction,
    recent,
  } = useLoaderData<typeof loader>();

  return (
    <Page title="AI 客服控制台">
      <TitleBar title="AI 客服控制台" />
      <BlockStack gap="400">
        <InlineStack gap="400" wrap>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                待处理会话
              </Text>
              <Text as="p" variant="heading2xl">
                {pendingConversations}
              </Text>
              <Button url="/app/conversations?status=PENDING" variant="primary">
                处理会话
              </Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                已处理会话
              </Text>
              <Text as="p" variant="heading2xl">
                {handledConversations}
              </Text>
              <Button url="/app/conversations?status=HANDLED">查看记录</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                AI 已暂停
              </Text>
              <Text as="p" variant="heading2xl">
                {pausedAiConversations}
              </Text>
              <Button url="/app/conversations?ai=off">查看接管会话</Button>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="p" variant="bodySm" tone="subdued">
                商品同步失败
              </Text>
              <Text as="p" variant="heading2xl">
                {failedProducts}
              </Text>
              <Button url="/app/products?status=failed">排查商品</Button>
            </BlockStack>
          </Card>
        </InlineStack>

        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  下一步建议
                </Text>
                <Badge tone={nextAction.tone}>{nextAction.title}</Badge>
              </InlineStack>
              <Text as="p" variant="bodyMd">
                {nextAction.body}
              </Text>
            </BlockStack>
            <Button url={nextAction.url} variant="primary">
              {nextAction.action}
            </Button>
          </InlineStack>
        </Card>

        <Card>
          <InlineStack align="space-between" blockAlign="center" gap="300" wrap>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  域名配置
                </Text>
                <Badge tone="success">安装诊断</Badge>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                店铺域名：{domainConfig.storefrontDomain}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                App Proxy：{domainConfig.appProxyBaseUrl}
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                会话接口格式：{domainConfig.conversationApiPattern}
              </Text>
            </BlockStack>
            <Button url={domainConfig.appProxyBaseUrl}>打开代理入口</Button>
          </InlineStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  最近会话
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  共 {totalConversations} 个会话，{productSnapshots} 个商品快照可用于 AI 推荐。
                </Text>
              </BlockStack>
              <Button url="/app/conversations">进入工作台</Button>
            </InlineStack>
            {recent.length === 0 ? (
              <Text as="p" variant="bodyMd" tone="subdued">
                暂无会话。顾客在店铺聊天框发消息后会出现在这里。
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
                    <Link
                      to={`/app/conversations/${c.id}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      <InlineStack align="space-between" blockAlign="center" gap="300">
                        <BlockStack gap="100">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              flexWrap: "wrap",
                            }}
                          >
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              访客 {c.visitorId.slice(0, 8)}
                            </Text>
                            <Badge tone={c.status === "PENDING" ? "critical" : "success"}>
                              {c.status === "PENDING" ? "待处理" : "已处理"}
                            </Badge>
                            <Badge tone={c.aiEnabled ? "success" : "critical"}>
                              {`AI ${c.aiEnabled ? "开启" : "暂停"}`}
                            </Badge>
                          </div>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {c.preview || "暂无消息"}
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {new Date(c.updatedAt).toLocaleString()}
                          </Text>
                        </BlockStack>
                        <Text as="span" variant="bodySm" tone="subdued">
                          打开
                        </Text>
                      </InlineStack>
                    </Link>
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
