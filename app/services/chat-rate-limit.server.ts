import prisma from "../db.server";

const WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 12;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export async function checkChatRateLimit(
  shop: string,
  visitorId: string,
): Promise<RateLimitResult> {
  const now = new Date();
  const existing = await prisma.chatRateLimit.findUnique({
    where: { shop_visitorId: { shop, visitorId } },
  });

  if (!existing || now.getTime() - existing.windowStart.getTime() >= WINDOW_MS) {
    await prisma.chatRateLimit.upsert({
      where: { shop_visitorId: { shop, visitorId } },
      create: { shop, visitorId, windowStart: now, count: 1 },
      update: { windowStart: now, count: 1 },
    });
    return { allowed: true };
  }

  if (existing.count >= MAX_MESSAGES_PER_WINDOW) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((WINDOW_MS - (now.getTime() - existing.windowStart.getTime())) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  await prisma.chatRateLimit.update({
    where: { shop_visitorId: { shop, visitorId } },
    data: { count: { increment: 1 } },
  });
  return { allowed: true };
}
