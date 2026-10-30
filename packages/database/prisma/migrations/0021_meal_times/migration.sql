-- ════════════════════════════════════════════════════════════════════════════
-- 0021_meal_times — meal times on the patient profile (Phase 2 of docs/roadmap/mvp-2.md).
--
-- One "HH:MM" per meal, in the meal plan's slot order. Onboarding asks for them;
-- reminders and Comidas use them. Existing profiles get the defaults for their
-- number of meals (@limon/validation defaultMealTimes).
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "patient_profiles" ADD COLUMN "meal_times" TEXT[];

UPDATE "patient_profiles" SET "meal_times" = CASE "meals_per_day"
  WHEN 3 THEN ARRAY['08:00', '14:00', '20:00']
  WHEN 4 THEN ARRAY['08:00', '14:00', '17:00', '20:00']
  ELSE ARRAY['08:00', '11:00', '14:00', '17:00', '20:00']
END;

ALTER TABLE "patient_profiles" ALTER COLUMN "meal_times" SET NOT NULL;

-- ── Checks Prisma can't express (same rules as @limon/validation) ──────────
-- One time per meal; the order of the times is checked by the API.
ALTER TABLE "patient_profiles" ADD CONSTRAINT "patient_profiles_meal_times_check" CHECK (
  cardinality("meal_times") = "meals_per_day"
);
