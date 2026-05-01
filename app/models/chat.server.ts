import type { Prisma } from "@prisma/client";

import prisma from "../db.server";

/** Prisma enum values; avoid runtime imports from `@prisma/client` (Vite SSR / CJS). */
export type ChatSender = "VISITOR" | "STAFF" | "AI";
export type ChatMessageKind = "TEXT" | "PRODUCT_RECOMMENDATION";
export type ConversationStatus = "PENDING" | "HANDLED";

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

export type ConversationListFilters = {
  status?: ConversationStatus | "ALL";
  ai?: "on" | "off" | "all";
  tag?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export const CONVERSATION_PAGE_SIZE = 25;

/** Matches UUID v4 from `crypto.randomUUID()`. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidVisitorId(id: string) {
  return id.length <= 64 && UUID_RE.test(id);
}

const CLIENT_MESSAGE_ID_RE = /^[A-Za-z0-9:_-]{8,120}$/;

export function isValidClientMessageId(id: string) {
  return CLIENT_MESSAGE_ID_RE.test(id);
}

function nowDate() {
  return new Date();
}

function messageStatus(sender: ChatSender): ConversationStatus {
  return sender === "VISITOR" ? "PENDING" : "HANDLED";
}

function preview(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

export function normalizeTagLabel(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 32);
}

export function parseConversationStatus(
  value: string | null,
): ConversationStatus | "ALL" {
  if (value === "PENDING" || value === "HANDLED") return value;
  return "ALL";
}

export function parseAiFilter(value: string | null): "on" | "off" | "all" {
  if (value === "on" || value === "off") return value;
  return "all";
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

export async function setConversationStatus(
  shop: string,
  conversationId: string,
  status: ConversationStatus,
) {
  return prisma.conversation.updateMany({
    where: { id: conversationId, shop },
    data: {
      status,
      staffLastReadAt: status === "HANDLED" ? nowDate() : undefined,
    },
  });
}

export async function updateConversationNote(
  shop: string,
  conversationId: string,
  internalNote: string,
) {
  return prisma.conversation.updateMany({
    where: { id: conversationId, shop },
    data: { internalNote: internalNote.trim().slice(0, 4000) || null },
  });
}

export async function addConversationTag(
  shop: string,
  conversationId: string,
  label: string,
) {
  const normalized = normalizeTagLabel(label);
  if (!normalized) return null;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, shop },
    select: { id: true },
  });
  if (!conversation) return null;

  return prisma.conversationTag.upsert({
    where: {
      conversationId_label: {
        conversationId: conversation.id,
        label: normalized,
      },
    },
    create: {
      conversationId: conversation.id,
      label: normalized,
    },
    update: {},
  });
}

export async function removeConversationTag(
  shop: string,
  conversationId: string,
  label: string,
) {
  const normalized = normalizeTagLabel(label);
  if (!normalized) return { count: 0 };

  return prisma.conversationTag.deleteMany({
    where: {
      label: normalized,
      conversation: { id: conversationId, shop },
    },
  });
}

export async function listTagsForShop(shop: string) {
  const tags = await prisma.conversationTag.findMany({
    where: { conversation: { shop } },
    distinct: ["label"],
    orderBy: { label: "asc" },
    select: { label: true },
  });
  return tags.map((tag) => tag.label);
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
  options: {
    status?: ConversationStatus;
    aiEnabled?: boolean;
    clientMessageId?: string;
  } = {},
) {
  const findExisting = () =>
    options.clientMessageId
      ? prisma.message.findUnique({
          where: {
            conversationId_clientMessageId: {
              conversationId,
              clientMessageId: options.clientMessageId,
            },
          },
        })
      : Promise.resolve(null);

  if (options.clientMessageId) {
    const existing = await findExisting();
    if (existing) return existing;
  }

  const createdAt = nowDate();
  const status = options.status ?? messageStatus(sender);
  const conversationUpdate: Prisma.ConversationUpdateInput = {
    updatedAt: createdAt,
    lastMessageAt: createdAt,
    lastMessageSender: sender,
    lastMessagePreview: preview(body),
    status,
  };

  if (sender === "STAFF") {
    conversationUpdate.aiEnabled = options.aiEnabled ?? false;
    conversationUpdate.staffLastReadAt = createdAt;
  } else if (typeof options.aiEnabled === "boolean") {
    conversationUpdate.aiEnabled = options.aiEnabled;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          sender,
          body,
          kind,
          metadata: metadata === undefined ? undefined : JSON.stringify(metadata),
          clientMessageId: options.clientMessageId,
          createdAt,
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: conversationUpdate,
      });

      return message;
    });
  } catch (error) {
    if (
      options.clientMessageId &&
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      const existing = await findExisting();
      if (existing) return existing;
    }
    throw error;
  }
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
  clientMessageId: string | null;
  createdAt: Date;
}) {
  return {
    id: m.id,
    sender: m.sender,
    kind: m.kind,
    body: m.body,
    metadata: parseMessageMetadata(m.metadata),
    clientMessageId: m.clientMessageId,
    createdAt: m.createdAt.toISOString(),
  };
}

function buildConversationWhere(
  shop: string,
  filters: ConversationListFilters,
  status?: ConversationStatus,
): Prisma.ConversationWhereInput {
  const where: Prisma.ConversationWhereInput = { shop };
  const effectiveStatus =
    status ?? (filters.status && filters.status !== "ALL" ? filters.status : undefined);
  const tag = filters.tag ? normalizeTagLabel(filters.tag) : "";
  const q = filters.q?.trim();

  if (effectiveStatus) where.status = effectiveStatus;
  if (filters.ai === "on") where.aiEnabled = true;
  if (filters.ai === "off") where.aiEnabled = false;
  if (tag) where.tags = { some: { label: tag } };
  if (q) {
    where.OR = [
      { visitorId: { contains: q } },
      { lastMessagePreview: { contains: q } },
      { messages: { some: { body: { contains: q } } } },
    ];
  }

  return where;
}

const conversationOrderBy: Prisma.ConversationOrderByWithRelationInput[] = [
  { lastMessageAt: "desc" },
  { updatedAt: "desc" },
];

export async function listConversationsForShop(shop: string, take = 50) {
  return prisma.conversation.findMany({
    where: { shop },
    orderBy: conversationOrderBy,
    take,
    include: {
      tags: { orderBy: { label: "asc" } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
}

export async function listConversationInbox(
  shop: string,
  filters: ConversationListFilters = {},
) {
  const pageSize = Math.max(1, Math.min(filters.pageSize ?? CONVERSATION_PAGE_SIZE, 100));
  const page = Math.max(1, filters.page ?? 1);
  const skip = (page - 1) * pageSize;

  if (filters.status && filters.status !== "ALL") {
    const where = buildConversationWhere(shop, filters);
    const [total, conversations] = await prisma.$transaction([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        orderBy: conversationOrderBy,
        skip,
        take: pageSize,
        include: { tags: { orderBy: { label: "asc" } } },
      }),
    ]);

    return {
      conversations,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  const pendingWhere = buildConversationWhere(shop, filters, "PENDING");
  const handledWhere = buildConversationWhere(shop, filters, "HANDLED");
  const [pendingTotal, handledTotal] = await prisma.$transaction([
    prisma.conversation.count({ where: pendingWhere }),
    prisma.conversation.count({ where: handledWhere }),
  ]);

  const conversations = [];
  let remaining = pageSize;

  if (skip < pendingTotal) {
    const pending = await prisma.conversation.findMany({
      where: pendingWhere,
      orderBy: conversationOrderBy,
      skip,
      take: remaining,
      include: { tags: { orderBy: { label: "asc" } } },
    });
    conversations.push(...pending);
    remaining -= pending.length;
  }

  if (remaining > 0) {
    const handledSkip = Math.max(0, skip - pendingTotal);
    const handled = await prisma.conversation.findMany({
      where: handledWhere,
      orderBy: conversationOrderBy,
      skip: handledSkip,
      take: remaining,
      include: { tags: { orderBy: { label: "asc" } } },
    });
    conversations.push(...handled);
  }

  const total = pendingTotal + handledTotal;
  return {
    conversations,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getConversationForShop(shop: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, shop },
    include: {
      tags: { orderBy: { label: "asc" } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 500,
      },
    },
  });
}
