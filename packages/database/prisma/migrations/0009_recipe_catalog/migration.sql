-- ════════════════════════════════════════════════════════════════════════════
-- 0009_recipe_catalog — the food catalog, the default recipe library and tenant
-- recipes with their ingredients (week 3 of docs/roadmap/mvp-roadmap.md).
--
--  * foods, default_recipes, default_recipe_ingredients: platform reference data,
--    shared by every tenant. No tenant_id, no RLS; read-only for the app role.
--    Our team curates them with the owner role.
--  * recipes, recipe_ingredients: tenant-owned (RLS), copied from the defaults when
--    a tenant is created and editable afterwards.
--  * No nutrient values or serving sizes anywhere: FatSecret only lets us store its ids.
--
-- foods and recipes were empty placeholders until now. foods was tenant-scoped, so it
-- is dropped (with its 0002 RLS policy) and recreated as a global table.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "SmaeGroup" AS ENUM ('VEGETABLES', 'FRUITS', 'CEREALS_FAT_FREE', 'CEREALS_WITH_FAT', 'LEGUMES', 'ANIMAL_VERY_LOW_FAT', 'ANIMAL_LOW_FAT', 'ANIMAL_MODERATE_FAT', 'ANIMAL_HIGH_FAT', 'MILK_SKIM', 'MILK_SEMI_SKIM', 'MILK_WHOLE', 'MILK_WITH_SUGAR', 'FATS_WITHOUT_PROTEIN', 'FATS_WITH_PROTEIN', 'SUGARS_FAT_FREE', 'SUGARS_WITH_FAT', 'FREE_FOODS', 'ALCOHOLIC_BEVERAGES');

-- CreateEnum
CREATE TYPE "ShoppingCategory" AS ENUM ('PRODUCE', 'MEAT_FISH', 'DAIRY_EGGS', 'BAKERY', 'GROCERY', 'NUTS_SEEDS');

-- CreateEnum
CREATE TYPE "IngredientUnit" AS ENUM ('G', 'ML', 'PIECE', 'CUP', 'TBSP', 'TSP');

-- Recreate foods as a global table
DROP TABLE "foods";

CREATE TABLE "foods" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fatsecret_food_id" TEXT NOT NULL,
    "fatsecret_serving_id" TEXT NOT NULL,
    "smae_group" "SmaeGroup",
    "grams_per_equivalent" DOUBLE PRECISION,
    "shopping_category" "ShoppingCategory" NOT NULL,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "recipes" ADD COLUMN     "image_key" TEXT,
ADD COLUMN     "meal_types" "MealType"[],
ADD COLUMN     "servings" INTEGER NOT NULL,
ADD COLUMN     "source_default_recipe_id" UUID,
ADD COLUMN     "steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "total_minutes" INTEGER;

-- CreateTable
CREATE TABLE "default_recipes" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "meal_types" "MealType"[],
    "servings" INTEGER NOT NULL,
    "total_minutes" INTEGER,
    "image_key" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "default_recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_recipe_ingredients" (
    "id" UUID NOT NULL,
    "default_recipe_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "default_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "IngredientUnit" NOT NULL,
    "grams" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "default_recipe_ingredients_food_id_idx" ON "default_recipe_ingredients"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "default_recipe_ingredients_default_recipe_id_position_key" ON "default_recipe_ingredients"("default_recipe_id", "position");

-- CreateIndex
CREATE INDEX "recipe_ingredients_food_id_idx" ON "recipe_ingredients"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_tenant_id_recipe_id_position_key" ON "recipe_ingredients"("tenant_id", "recipe_id", "position");

-- CreateIndex
CREATE INDEX "foods_smae_group_idx" ON "foods"("smae_group");

-- CreateIndex
CREATE UNIQUE INDEX "foods_key_key" ON "foods"("key");

-- CreateIndex
CREATE INDEX "foods_fatsecret_food_id_idx" ON "foods"("fatsecret_food_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_tenant_id_source_default_recipe_id_key" ON "recipes"("tenant_id", "source_default_recipe_id");

-- AddForeignKey
ALTER TABLE "default_recipe_ingredients" ADD CONSTRAINT "default_recipe_ingredients_default_recipe_id_fkey" FOREIGN KEY ("default_recipe_id") REFERENCES "default_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "default_recipe_ingredients" ADD CONSTRAINT "default_recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_source_default_recipe_id_fkey" FOREIGN KEY ("source_default_recipe_id") REFERENCES "default_recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_tenant_id_recipe_id_fkey" FOREIGN KEY ("tenant_id", "recipe_id") REFERENCES "recipes"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Checks (the API and curation script validate first) ─────────────────────
ALTER TABLE "foods"
  -- An SMAE food needs both its group and its grams per equivalent, or neither.
  ADD CONSTRAINT "foods_smae_check" CHECK (
    ("smae_group" IS NULL AND "grams_per_equivalent" IS NULL)
    OR ("smae_group" IS NOT NULL AND "grams_per_equivalent" IS NOT NULL AND "grams_per_equivalent" > 0));

-- Prisma creates list columns as nullable; a recipe always fits at least one meal type.
ALTER TABLE "default_recipes"
  ALTER COLUMN "meal_types" SET NOT NULL,
  ADD CONSTRAINT "default_recipes_meal_types_check" CHECK (cardinality("meal_types") > 0),
  ADD CONSTRAINT "default_recipes_servings_check" CHECK ("servings" > 0),
  ADD CONSTRAINT "default_recipes_total_minutes_check" CHECK ("total_minutes" > 0);

ALTER TABLE "recipes"
  ALTER COLUMN "meal_types" SET NOT NULL,
  ADD CONSTRAINT "recipes_meal_types_check" CHECK (cardinality("meal_types") > 0),
  ADD CONSTRAINT "recipes_servings_check" CHECK ("servings" > 0),
  ADD CONSTRAINT "recipes_total_minutes_check" CHECK ("total_minutes" > 0);

ALTER TABLE "default_recipe_ingredients"
  ADD CONSTRAINT "default_recipe_ingredients_amount_check" CHECK ("quantity" > 0 AND "grams" > 0);

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_amount_check" CHECK ("quantity" > 0 AND "grams" > 0);


-- ── RLS (same model as 0002_rls). recipes already has its policy from 0002. ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recipe_ingredients'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Reference tables are read-only for the app role. The REVOKE matters locally, where
-- default privileges (docker/init.sql) grant full DML on every new table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON recipe_ingredients TO limon_app;
    GRANT SELECT ON foods, default_recipes, default_recipe_ingredients TO limon_app;
    REVOKE INSERT, UPDATE, DELETE ON foods, default_recipes, default_recipe_ingredients FROM limon_app;
  END IF;
END $$;
