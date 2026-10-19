-- ════════════════════════════════════════════════════════════════════════════
-- 0019_meal_logs — meal check-off (Phase 1 of docs/roadmap/mvp-2.md).
--
-- One row per answered meal slot: eaten, skipped, or something else (with an
-- optional note). Keyed by the day and slot, not the plan meal, so the answer
-- survives a regenerated day; it keeps the slot's recipe, servings and swaps
-- as they were when logged. No kcal is stored (FatSecret allows ids only).
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "MealLogStatus" AS ENUM ('EATEN', 'SKIPPED', 'OTHER');

-- CreateEnum
CREATE TYPE "MealLogSource" AS ENUM ('APP', 'NOTIFICATION');

-- CreateTable
CREATE TABLE "meal_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "slot" INTEGER NOT NULL,
    "meal_type" "MealType" NOT NULL,
    "status" "MealLogStatus" NOT NULL,
    "note" TEXT,
    "recipe_id" UUID,
    "servings" DOUBLE PRECISION,
    "swaps" JSONB NOT NULL DEFAULT '[]',
    "source" "MealLogSource" NOT NULL DEFAULT 'APP',
    "logged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_logs_tenant_id_recipe_id_idx" ON "meal_logs"("tenant_id", "recipe_id");

-- CreateIndex
CREATE UNIQUE INDEX "meal_logs_tenant_id_patient_id_date_slot_key" ON "meal_logs"("tenant_id", "patient_id", "date", "slot");

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_tenant_id_recipe_id_fkey" FOREIGN KEY ("tenant_id", "recipe_id") REFERENCES "recipes"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── Checks Prisma can't express (same bounds as @limon/validation) ──────────
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_slot_check" CHECK ("slot" >= 0);
-- A note only describes "something else", and stays short.
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_note_check" CHECK (
  "note" IS NULL OR ("status" = 'OTHER' AND char_length("note") BETWEEN 1 AND 140)
);
-- An empty slot (no recipe) can only be answered with "something else".
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_recipe_check" CHECK (
  ("recipe_id" IS NOT NULL AND "servings" > 0) OR ("recipe_id" IS NULL AND "servings" IS NULL AND "status" = 'OTHER')
);
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_swaps_check" CHECK (jsonb_typeof("swaps") = 'array');

-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
ALTER TABLE "meal_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "meal_logs"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON meal_logs TO limon_app;
  END IF;
END $$;
