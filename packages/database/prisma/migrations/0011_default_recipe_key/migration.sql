-- ════════════════════════════════════════════════════════════════════════════
-- 0011_default_recipe_key — a stable curation key for default recipes, like
-- foods.key, so `admin default-recipes` can re-import private/recipes.csv and
-- update a recipe instead of adding it twice.
--
-- Nothing loaded default recipes before this, so existing rows (only test data)
-- get their id as key.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "default_recipes" ADD COLUMN "key" TEXT;
UPDATE "default_recipes" SET "key" = "id"::text;
ALTER TABLE "default_recipes" ALTER COLUMN "key" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "default_recipes_key_key" ON "default_recipes"("key");
