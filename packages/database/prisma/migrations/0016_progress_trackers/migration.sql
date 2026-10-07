-- ════════════════════════════════════════════════════════════════════════════
-- 0016_progress_trackers — weigh-ins, body measurements and water (week 6 of
-- docs/roadmap/mvp-roadmap.md).
--
-- body_logs keeps one row per day with the weight and/or measurements; the
-- latest weight is also the profile's weight. water_intakes keeps one row per
-- glass the patient logs, and water_settings their own daily target when they
-- change the default. patient_goals gains the weight the goal started from.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable: goals set before this migration start from the profile's weight.
ALTER TABLE "patient_goals" ADD COLUMN "start_weight_kg" DOUBLE PRECISION;
UPDATE "patient_goals" g SET "start_weight_kg" = p."weight_kg"
  FROM "patient_profiles" p
  WHERE p."tenant_id" = g."tenant_id" AND p."patient_id" = g."patient_id";
-- A goal needs a finished profile (setMyGoal), so every row has one; this is only a safety net.
DELETE FROM "patient_goals" WHERE "start_weight_kg" IS NULL;
ALTER TABLE "patient_goals" ALTER COLUMN "start_weight_kg" SET NOT NULL;

-- CreateTable
CREATE TABLE "body_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "hip_cm" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "arm_cm" DOUBLE PRECISION,
    "thigh_cm" DOUBLE PRECISION,
    "body_fat_pct" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "body_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_intakes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amount_ml" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_settings" (
    "patient_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "target_ml" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "water_settings_pkey" PRIMARY KEY ("patient_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "body_logs_tenant_id_patient_id_date_key" ON "body_logs"("tenant_id", "patient_id", "date");

-- CreateIndex
CREATE INDEX "water_intakes_tenant_id_patient_id_date_idx" ON "water_intakes"("tenant_id", "patient_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "water_settings_tenant_id_patient_id_key" ON "water_settings"("tenant_id", "patient_id");

-- AddForeignKey
ALTER TABLE "body_logs" ADD CONSTRAINT "body_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "body_logs" ADD CONSTRAINT "body_logs_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_intakes" ADD CONSTRAINT "water_intakes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_intakes" ADD CONSTRAINT "water_intakes_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_settings" ADD CONSTRAINT "water_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_settings" ADD CONSTRAINT "water_settings_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ── Checks Prisma can't express (same bounds as @limon/validation) ──────────
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_start_weight_kg_check" CHECK ("start_weight_kg" > 0);
ALTER TABLE "body_logs" ADD CONSTRAINT "body_logs_values_check" CHECK (
  ("weight_kg" IS NULL OR "weight_kg" > 0) AND
  ("waist_cm" IS NULL OR "waist_cm" > 0) AND
  ("hip_cm" IS NULL OR "hip_cm" > 0) AND
  ("chest_cm" IS NULL OR "chest_cm" > 0) AND
  ("arm_cm" IS NULL OR "arm_cm" > 0) AND
  ("thigh_cm" IS NULL OR "thigh_cm" > 0) AND
  ("body_fat_pct" IS NULL OR ("body_fat_pct" > 0 AND "body_fat_pct" < 100))
);
-- An empty day is deleted, never stored.
ALTER TABLE "body_logs" ADD CONSTRAINT "body_logs_not_empty_check" CHECK (
  num_nonnulls("weight_kg", "waist_cm", "hip_cm", "chest_cm", "arm_cm", "thigh_cm", "body_fat_pct") > 0
);
ALTER TABLE "water_intakes" ADD CONSTRAINT "water_intakes_amount_ml_check" CHECK ("amount_ml" > 0);
ALTER TABLE "water_settings" ADD CONSTRAINT "water_settings_target_ml_check" CHECK ("target_ml" > 0);

-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
ALTER TABLE "body_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "body_logs"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

ALTER TABLE "water_intakes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "water_intakes"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

ALTER TABLE "water_settings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "water_settings"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON body_logs TO limon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON water_intakes TO limon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON water_settings TO limon_app;
  END IF;
END $$;
