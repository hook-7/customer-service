import prisma from "../db.server";

/** Prisma enum values; avoid runtime imports from `@prisma/client` (Vite SSR / CJS). */
export type ChatSender = "VISITOR" | "STAFF" | "AI";
export type ChatMessageKind = "TEXT" | "PRODUCT_RECOMMENDATION";

export type ProductRecommendationMetadata = {
  products: Array<{
    productGid: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    productUrl?: string | null;
    variantGid?: string | null;
    price?: string | null;
    currencyCode?: string | null;
    reason?: string | null;
    available: boolean;
  }>;
};

/** Matches UUID v4 from `crypto.randomUUID()`. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidVisitorId(id: string) {
  return id.length <= 64 && UUID_RE.test(id);
}

export async function getOrCreateConversation(shop: string, visitorId: string) {
  return prisma.conversation.upsert({
    where: {
      shop_visitorId: { shop, visitorId },
    },
    create: { shop, visitorId },
    update: {},
  });
}

export async function setConversationAiEnabled(
  shop: string,
  conversationId: string,
  aiEnabled: boolean,
) {
  return prisma.conversation.updateMany({
    where: { id: conversationId, shop },
    data: { aiEnabled },
  });
}

export async function listMessagesForConversation(
  conversationId: string,
  take = 200,
) {
  return prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take,
  });
}

export async function appendMessage(
  conversationId: string,
  sender: ChatSender,
  body: string,
  kind: ChatMessageKind = "TEXT",
  metadata?: unknown,
) {
  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        sender,
        body,
        kind,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
      },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

export function parseMessageMetadata<T>(metadata: string | null): T | null {
  if (!metadata) return null;
  try {
    return JSON.parse(metadata) as T;
  } catch {
    return null;
  }
}

export function serializeMessage(m: {
  id: string;
  sender: ChatSender;
  kind: ChatMessageKind;
  body: string;
  metadata: string | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    sender: m.sender,
    kind: m.kind,
    body: m.body,
    metadata: parseMessageMetadata(m.metadata),
    createdAt: m.createdAt.toISOString(),
  };
}

export async function listConversationsForShop(shop: string) {
  return prisma.conversation.findMany({
    where: { shop },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function getConversationForShop(shop: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, shop },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        take: 500,
      },
    },
  });
}
