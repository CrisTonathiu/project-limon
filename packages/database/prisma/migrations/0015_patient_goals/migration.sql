-- ════════════════════════════════════════════════════════════════════════════
-- 0015_patient_goals — goal setting (week 6 of docs/roadmap/mvp-roadmap.md).
--
-- The patient states an intention (lose, maintain, gain, nutrition quality,
-- build muscle, other) and, to lose or gain, a pace. The clinic's rules, which
-- may only be stricter than the platform's guardrails, decide the starting
-- target. The decision is stored with the rules version it used.
-- ════════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "GoalIntention" AS ENUM ('LOSE_WEIGHT', 'MAINTAIN_WEIGHT', 'GAIN_WEIGHT', 'NUTRITION_QUALITY', 'BUILD_MUSCLE', 'OTHER');

-- CreateEnum
CREATE TYPE "WeightGoal" AS ENUM ('LOSE', 'MAINTAIN', 'GAIN');

-- CreateEnum
CREATE TYPE "GoalPace" AS ENUM ('GENTLE', 'MODERATE', 'FAST');

-- CreateEnum
CREATE TYPE "RecentWeightChange" AS ENUM ('STABLE', 'LOST', 'GAINED', 'UNSURE');

-- CreateEnum
CREATE TYPE "GoalDecisionReason" AS ENUM ('AS_CHOSEN', 'MAINTAIN', 'LEAN_GAIN', 'OTHER', 'RECENT_WEIGHT_LOSS', 'DESIRED_WEIGHT_TOO_LOW');

-- CreateTable
CREATE TABLE "tenant_goal_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_goal_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_goals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "intention" "GoalIntention" NOT NULL,
    "pace" "GoalPace",
    "desired_change_kg" DOUBLE PRECISION,
    "other_text" TEXT,
    "recent_weight_change" "RecentWeightChange" NOT NULL,
    "decided_goal" "WeightGoal" NOT NULL,
    "decided_pace" "GoalPace",
    "reason" "GoalDecisionReason" NOT NULL,
    "rules_version" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_goal_rules_tenant_id_version_key" ON "tenant_goal_rules"("tenant_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "patient_goals_tenant_id_patient_id_key" ON "patient_goals"("tenant_id", "patient_id");

-- AddForeignKey
ALTER TABLE "tenant_goal_rules" ADD CONSTRAINT "tenant_goal_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ── Checks Prisma can't express ─────────────────────────────────────────────
ALTER TABLE "tenant_goal_rules" ADD CONSTRAINT "tenant_goal_rules_version_check" CHECK ("version" > 0);
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_desired_change_kg_check"
  CHECK ("desired_change_kg" IS NULL OR "desired_change_kg" > 0);
-- A pace only goes with a direction: maintaining has none.
ALTER TABLE "patient_goals" ADD CONSTRAINT "patient_goals_decided_pace_check"
  CHECK (("decided_goal" = 'MAINTAIN') = ("decided_pace" IS NULL));

-- ── RLS (same model as 0002_rls) ────────────────────────────────────────────
ALTER TABLE "tenant_goal_rules" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_goal_rules"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

ALTER TABLE "patient_goals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "patient_goals"
  USING (tenant_id = app_current_tenant_id()) WITH CHECK (tenant_id = app_current_tenant_id());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'limon_app') THEN
    -- The app only reads the rules; our team writes them with the admin command (owner role).
    GRANT SELECT ON tenant_goal_rules TO limon_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON patient_goals TO limon_app;
  END IF;
END $$;
