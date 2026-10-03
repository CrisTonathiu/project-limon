-- ════════════════════════════════════════════════════════════════════════════
-- 0012_meal_plans — storage for the weekly meal plan generator (week 4 of
-- docs/roadmap/mvp-roadmap.md).
--
-- meal_plans was an unused placeholder (title, starts_on); it becomes one plan
-- per patient and week. Each meal slot is a meal_plan_meals row holding only a
-- recipe id and a portion factor: no nutrient values, per the FatSecret terms.
-- meal_feedback records favourites, which the generator boosts.
--
-- Existing meal_plans rows are dropped: nothing ever wrote to the placeholder.
-- ════════════════════════════════════════════════════════════════════════════

DELETE FROM "meal_plans";

-- DropIndex
DROP INDEX "meal_plans_tenant_id_patient_id_idx";

-- AlterTable
ALTER TABLE "meal_plans" DROP COLUMN "starts_on",
DROP COLUMN "title",
ADD COLUMN     "week_start" DATE NOT NULL;

-- CreateTable
CREATE TABLE "meal_plan_meals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "meal_plan_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "slot" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "recipe_id" UUID,
    "servings" DOUBLE PRECISION,

    CONSTRAINT "meal_plan_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_feedback" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "recipe_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "week_start" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_plan_meals_tenant_id_recipe_id_idx" ON "meal_plan_meals"("tenant_id", "recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_meals_tenant_id_meal_plan_id_date_slot_key" ON "meal_plan_meals"("tenant_id", "meal_plan_id", "date", "slot");

-- CreateIndex
CREATE INDEX "meal_feedback_tenant_id_recipe_id_idx" ON "meal_feedback"("tenant_id", "recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_feedback_tenant_id_patient_id_recipe_id_week_start_key" ON "meal_feedback"("tenant_id", "patient_id", "recipe_id", "week_start");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_tenant_id_id_key" ON "meal_plans"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plans_tenant_id_patient_id_week_start_key" ON "meal_plans"("tenant_id", "patient_id", "week_start");

-- AddForeignKey
ALTER TABLE "meal_plan_meals" ADD CONSTRAINT "meal_plan_meals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_meals" ADD CONSTRAINT "meal_plan_meals_tenant_id_meal_plan_id_fkey" FOREIGN KEY ("tenant_id", "meal_plan_id") REFERENCES "meal_plans"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_meals" ADD CONSTRAINT "meal_plan_meals_tenant_id_recipe_id_fkey" FOREIGN KEY ("tenant_id", "recipe_id") REFERENCES "recipes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_tenant_id_recipe_id_fkey" FOREIGN KEY ("tenant_id", "recipe_id") REFERENCES "recipes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Checks Prisma can't express ─────────────────────────────────────────────
ALTER TABLE "meal_plan_meals"
  ADD CONSTRAINT "meal_plan_meals_slot_check" CHECK ("slot" >= 0),
  -- A filled slot has both a recipe and a portion; an empty one has neither.
  ADD CONSTRAINT "meal_plan_meals_recipe_servings_check"
    CHECK (("recipe_id" IS NULL) = ("servings" IS NULL) AND ("servings" IS NULL OR "servings" > 0));
ALTER TABLE "meal_feedback" ADD CONSTRAINT "meal_feedback_rating_check" CHECK ("rating" BETWEEN -1 AND 1);

-- ── RLS (same model as 0002_rls; meal_plans already has it) ─────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meal_plan_meals', 'meal_feedback'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON meal_plan_meals, meal_feedback TO limon_app;
  END IF;
END $$;
