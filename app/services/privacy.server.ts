import prisma from "../db.server";

export async function deleteShopData(shop: string) {
  await prisma.$transaction([
    prisma.backgroundJob.deleteMany({ where: { shop } }),
    prisma.chatRateLimit.deleteMany({ where: { shop } }),
    prisma.conversationTag.deleteMany({ where: { conversation: { shop } } }),
    prisma.message.deleteMany({ where: { conversation: { shop } } }),
    prisma.conversation.deleteMany({ where: { shop } }),
    prisma.productSnapshot.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);
}

export function logCustomerPrivacyWebhook(topic: string, shop: string) {
  console.log(`Received ${topic} webhook for ${shop}; no Shopify customer identity is stored locally.`);
}
