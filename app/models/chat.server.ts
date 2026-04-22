import prisma from "../db.server";

/** Prisma enum values; avoid runtime imports from `@prisma/client` (Vite SSR / CJS). */
export type ChatSender = "VISITOR" | "STAFF";

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
) {
  await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, sender, body },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
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
