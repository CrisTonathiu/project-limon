-- ════════════════════════════════════════════════════════════════════════════
-- 0013_meal_plan_swaps — SMAE food swaps on plan meals (week 5 of
-- docs/roadmap/mvp-roadmap.md).
--
-- A patient swaps one ingredient of one planned meal for a food of the same
-- SMAE group. Only the chosen food is stored; the grams follow from the
-- equivalents when the meal is read. The recipe is never changed.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "meal_plan_meal_swaps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "meal_plan_meal_id" UUID NOT NULL,
    "recipe_ingredient_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plan_meal_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_plan_meal_swaps_food_id_idx" ON "meal_plan_meal_swaps"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_meal_swaps_tenant_id_meal_plan_meal_id_recipe_ing_key" ON "meal_plan_meal_swaps"("tenant_id", "meal_plan_meal_id", "recipe_ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_meals_tenant_id_id_key" ON "meal_plan_meals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_tenant_id_id_key" ON "recipe_ingredients"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "meal_plan_meal_swaps" ADD CONSTRAINT "meal_plan_meal_swaps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_meal_swaps" ADD CONSTRAINT "meal_plan_meal_swaps_tenant_id_meal_plan_meal_id_fkey" FOREIGN KEY ("tenant_id", "meal_plan_meal_id") REFERENCES "meal_plan_meals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_meal_swaps" ADD CONSTRAINT "meal_plan_meal_swaps_tenant_id_recipe_ingredient_id_fkey" FOREIGN KEY ("tenant_id", "recipe_ingredient_id") REFERENCES "recipe_ingredients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_meal_swaps" ADD CONSTRAINT "meal_plan_meal_swaps_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
ALTER TABLE "meal_plan_meal_swaps" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meal_plan_meal_swaps"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON meal_plan_meal_swaps TO limon_app;
  END IF;
END $$;
