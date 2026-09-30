-- CreateTable
CREATE TABLE "fatsecret_food_cache" (
    "fatsecret_food_id" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT '',
    "food" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fatsecret_food_cache_pkey" PRIMARY KEY ("fatsecret_food_id","region","language")
);

-- CreateIndex
CREATE INDEX "fatsecret_food_cache_expires_at_idx" ON "fatsecret_food_cache"("expires_at");

-- CreateIndex
CREATE INDEX "fatsecret_food_cache_region_language_fetched_at_idx" ON "fatsecret_food_cache"("region", "language", "fetched_at");


-- Not tenant data: FatSecret's food data is the same for every tenant, so this table
-- has no tenant_id and no RLS policy (like a reference table). It only ever holds
-- provider data for up to 24 h; the maintenance job deletes expired rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON fatsecret_food_cache TO limon_app;
  END IF;
END $$;
