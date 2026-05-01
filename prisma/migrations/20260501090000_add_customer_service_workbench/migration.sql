ALTER TABLE "Conversation" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'HANDLED';
ALTER TABLE "Conversation" ADD COLUMN "lastMessageAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "lastMessageSender" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "lastMessagePreview" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "staffLastReadAt" DATETIME;
ALTER TABLE "Conversation" ADD COLUMN "internalNote" TEXT;

CREATE TABLE "ConversationTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationTag_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

UPDATE "Conversation"
SET
    "lastMessageAt" = (
        SELECT "createdAt"
        FROM "Message"
        WHERE "Message"."conversationId" = "Conversation"."id"
        ORDER BY "createdAt" DESC
        LIMIT 1
    ),
    "lastMessageSender" = (
        SELECT "sender"
        FROM "Message"
        WHERE "Message"."conversationId" = "Conversation"."id"
        ORDER BY "createdAt" DESC
        LIMIT 1
    ),
    "lastMessagePreview" = (
        SELECT "body"
        FROM "Message"
        WHERE "Message"."conversationId" = "Conversation"."id"
        ORDER BY "createdAt" DESC
        LIMIT 1
    );

UPDATE "Conversation"
SET "status" = CASE
    WHEN "lastMessageSender" = 'VISITOR' THEN 'PENDING'
    ELSE 'HANDLED'
END;

CREATE INDEX "Conversation_shop_status_updatedAt_idx" ON "Conversation"("shop", "status", "updatedAt");
CREATE INDEX "Conversation_shop_aiEnabled_updatedAt_idx" ON "Conversation"("shop", "aiEnabled", "updatedAt");
CREATE UNIQUE INDEX "ConversationTag_conversationId_label_key" ON "ConversationTag"("conversationId", "label");
CREATE INDEX "ConversationTag_label_idx" ON "ConversationTag"("label");
