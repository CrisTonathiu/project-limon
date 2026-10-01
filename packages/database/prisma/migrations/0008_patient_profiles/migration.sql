-- ════════════════════════════════════════════════════════════════════════════
-- 0008_patient_profiles — the patient's onboarding answers (sex, height, weight,
-- activity level, meals per day, allergies, disliked foods). One row per patient.
-- Birth date stays on patients.date_of_birth.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "BiologicalSex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- CreateTable
CREATE TABLE "patient_profiles" (
    "patient_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sex" "BiologicalSex" NOT NULL,
    "height_cm" INTEGER NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "activity_level" "ActivityLevel" NOT NULL,
    "meals_per_day" INTEGER NOT NULL,
    "pregnant_or_breastfeeding" BOOLEAN NOT NULL DEFAULT false,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disliked_foods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_profiles_pkey" PRIMARY KEY ("patient_id"),
    -- Same ranges as @limon/validation PatientProfileSchema; the API checks first.
    CONSTRAINT "patient_profiles_height_cm_check" CHECK ("height_cm" BETWEEN 100 AND 250),
    CONSTRAINT "patient_profiles_weight_kg_check" CHECK ("weight_kg" BETWEEN 25 AND 350),
    CONSTRAINT "patient_profiles_meals_per_day_check" CHECK ("meals_per_day" BETWEEN 3 AND 5)
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_profiles_tenant_id_patient_id_key" ON "patient_profiles"("tenant_id", "patient_id");

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_profiles'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON patient_profiles TO limon_app;
  END IF;
END $$;
