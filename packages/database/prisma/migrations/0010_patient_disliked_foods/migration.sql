-- ════════════════════════════════════════════════════════════════════════════
-- 0010_patient_disliked_foods — disliked foods become references to the food
-- catalog instead of free text, so the meal plan generator (week 4 of
-- docs/roadmap/mvp-roadmap.md) can leave out recipes that use them.
--
-- Existing free-text entries are matched to a food by name or curation key,
-- ignoring case, accents and surrounding spaces. Entries that match no food are
-- dropped: no environment has real patients yet, and the patient can pick the
-- food again from their profile.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateTable
CREATE TABLE "patient_disliked_foods" (
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_disliked_foods_pkey" PRIMARY KEY ("tenant_id","patient_id","food_id")
);

-- CreateIndex
CREATE INDEX "patient_disliked_foods_food_id_idx" ON "patient_disliked_foods"("food_id");

-- AddForeignKey
ALTER TABLE "patient_disliked_foods" ADD CONSTRAINT "patient_disliked_foods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_disliked_foods" ADD CONSTRAINT "patient_disliked_foods_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patient_profiles"("tenant_id", "patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_disliked_foods" ADD CONSTRAINT "patient_disliked_foods_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Map the free-text entries to foods ──────────────────────────────────────
-- Runs as the owner role, which RLS doesn't apply to, so every tenant's rows are mapped.
-- "Hígado de res " → "higado de res", matched against foods.name and foods.key
-- (keys use hyphens: "higado-de-res").
INSERT INTO "patient_disliked_foods" ("tenant_id", "patient_id", "food_id")
SELECT DISTINCT p."tenant_id", p."patient_id", f."id"
FROM "patient_profiles" p
CROSS JOIN LATERAL unnest(p."disliked_foods") AS d(text)
JOIN "foods" f
  ON lower(translate(btrim(d.text), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'))
     IN (lower(translate(f."name", 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), replace(f."key", '-', ' '));

-- AlterTable
ALTER TABLE "patient_profiles" DROP COLUMN "disliked_foods";


-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_disliked_foods'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    GRANT SELECT, INSERT, DELETE ON patient_disliked_foods TO limon_app;
  END IF;
END $$;
