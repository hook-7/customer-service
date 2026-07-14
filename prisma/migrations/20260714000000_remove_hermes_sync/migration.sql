DROP INDEX IF EXISTS "ProductSnapshot_shop_hermesSyncStatus_idx";

ALTER TABLE "ProductSnapshot"
  DROP COLUMN IF EXISTS "hermesSyncStatus",
  DROP COLUMN IF EXISTS "hermesSyncedAt",
  DROP COLUMN IF EXISTS "hermesError";

DROP TYPE IF EXISTS "HermesSyncStatus";
