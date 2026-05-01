CREATE TYPE "MessageSender" AS ENUM ('VISITOR', 'STAFF', 'AI');
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'PRODUCT_RECOMMENDATION');
CREATE TYPE "HermesSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');
CREATE TYPE "ConversationStatus" AS ENUM ('PENDING', 'HANDLED');
CREATE TYPE "BackgroundJobType" AS ENUM ('PRODUCT_UPSERT', 'PRODUCT_DELETE');
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ConversationStatus" NOT NULL DEFAULT 'HANDLED',
    "lastMessageAt" TIMESTAMP(3),
    "lastMessageSender" "MessageSender",
    "lastMessagePreview" TEXT,
    "staffLastReadAt" TIMESTAMP(3),
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "kind" "MessageKind" NOT NULL DEFAULT 'TEXT',
    "body" TEXT NOT NULL,
    "metadata" TEXT,
    "clientMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationTag" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductSnapshot" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "handle" TEXT NOT NULL,
    "imageUrl" TEXT,
    "productUrl" TEXT,
    "defaultVariantGid" TEXT,
    "price" TEXT,
    "currencyCode" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sourceUpdatedAt" TIMESTAMP(3),
    "hermesSyncStatus" "HermesSyncStatus" NOT NULL DEFAULT 'PENDING',
    "hermesSyncedAt" TIMESTAMP(3),
    "hermesError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackgroundJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" "BackgroundJobType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatRateLimit" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChatRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Conversation_shop_visitorId_key" ON "Conversation"("shop", "visitorId");
CREATE INDEX "Conversation_shop_updatedAt_idx" ON "Conversation"("shop", "updatedAt");
CREATE INDEX "Conversation_shop_status_updatedAt_idx" ON "Conversation"("shop", "status", "updatedAt");
CREATE INDEX "Conversation_shop_aiEnabled_updatedAt_idx" ON "Conversation"("shop", "aiEnabled", "updatedAt");
CREATE UNIQUE INDEX "Message_conversationId_clientMessageId_key" ON "Message"("conversationId", "clientMessageId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE UNIQUE INDEX "ConversationTag_conversationId_label_key" ON "ConversationTag"("conversationId", "label");
CREATE INDEX "ConversationTag_label_idx" ON "ConversationTag"("label");
CREATE UNIQUE INDEX "ProductSnapshot_shop_productGid_key" ON "ProductSnapshot"("shop", "productGid");
CREATE INDEX "ProductSnapshot_shop_available_published_idx" ON "ProductSnapshot"("shop", "available", "published");
CREATE INDEX "ProductSnapshot_shop_hermesSyncStatus_idx" ON "ProductSnapshot"("shop", "hermesSyncStatus");
CREATE INDEX "BackgroundJob_status_runAfter_idx" ON "BackgroundJob"("status", "runAfter");
CREATE INDEX "BackgroundJob_shop_status_idx" ON "BackgroundJob"("shop", "status");
CREATE UNIQUE INDEX "ChatRateLimit_shop_visitorId_key" ON "ChatRateLimit"("shop", "visitorId");
CREATE INDEX "ChatRateLimit_shop_windowStart_idx" ON "ChatRateLimit"("shop", "windowStart");

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationTag" ADD CONSTRAINT "ConversationTag_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
