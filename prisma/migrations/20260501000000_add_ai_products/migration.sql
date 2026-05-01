-- Redefine Message sender values with an AI sender used for automated replies.
-- SQLite stores Prisma enums as TEXT, so existing rows do not need rewriting.

ALTER TABLE "Conversation" ADD COLUMN "aiEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Message" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'TEXT';
ALTER TABLE "Message" ADD COLUMN "metadata" TEXT;

CREATE TABLE "ProductSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "sourceUpdatedAt" DATETIME,
    "hermesSyncStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "hermesSyncedAt" DATETIME,
    "hermesError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProductSnapshot_shop_productGid_key" ON "ProductSnapshot"("shop", "productGid");
CREATE INDEX "ProductSnapshot_shop_available_published_idx" ON "ProductSnapshot"("shop", "available", "published");
CREATE INDEX "ProductSnapshot_shop_hermesSyncStatus_idx" ON "ProductSnapshot"("shop", "hermesSyncStatus");
