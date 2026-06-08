CREATE TABLE "FatherDayCard" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLegacyId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "checkoutToken" TEXT NOT NULL,
    "fatherName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "fatherEmail" TEXT NOT NULL,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'thank_you_extension',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FatherDayCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FatherDayCard_shop_orderId_key" ON "FatherDayCard"("shop", "orderId");
CREATE INDEX "FatherDayCard_shop_createdAt_idx" ON "FatherDayCard"("shop", "createdAt");
CREATE INDEX "FatherDayCard_shop_customerEmail_idx" ON "FatherDayCard"("shop", "customerEmail");
CREATE INDEX "FatherDayCard_fatherEmail_idx" ON "FatherDayCard"("fatherEmail");
