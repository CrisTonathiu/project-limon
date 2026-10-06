-- ════════════════════════════════════════════════════════════════════════════
-- 0014_shopping_list_checks — the shopping list's checked items (week 5 of
-- docs/roadmap/mvp-roadmap.md).
--
-- The list itself isn't stored: it is worked out from the week's plan (after
-- swaps and portions) on every read. Only what the patient checked is kept,
-- with the amount the list asked for at the time.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "ShoppingUnit" AS ENUM ('G', 'ML', 'PIECE');

-- CreateTable
CREATE TABLE "shopping_list_checks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "food_id" UUID NOT NULL,
    "unit" "ShoppingUnit" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_list_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_list_checks_food_id_idx" ON "shopping_list_checks"("food_id");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_list_checks_tenant_id_patient_id_week_start_food_i_key" ON "shopping_list_checks"("tenant_id", "patient_id", "week_start", "food_id");

-- AddForeignKey
ALTER TABLE "shopping_list_checks" ADD CONSTRAINT "shopping_list_checks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_checks" ADD CONSTRAINT "shopping_list_checks_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_checks" ADD CONSTRAINT "shopping_list_checks_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ── Checks Prisma can't express ─────────────────────────────────────────────
ALTER TABLE "shopping_list_checks" ADD CONSTRAINT "shopping_list_checks_amount_check" CHECK ("amount" > 0);

-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
ALTER TABLE "shopping_list_checks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "shopping_list_checks"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON shopping_list_checks TO limon_app;
  END IF;
END $$;
