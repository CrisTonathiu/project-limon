-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('APPLE_APP_STORE', 'GOOGLE_PLAY', 'STRIPE');

-- CreateEnum
CREATE TYPE "PatientSubscriptionStatus" AS ENUM ('PENDING', 'TRIALING', 'ACTIVE', 'GRACE_PERIOD', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('PRIVACY_NOTICE', 'SENSITIVE_DATA', 'TERMS_OF_SERVICE');

-- CreateEnum
CREATE TYPE "StoreAccountType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "StoreAccountStatus" AS ENUM ('MAILBOX_CREATED', 'ENROLLMENT_INVITED', 'ENROLLED', 'ACCESS_GRANTED', 'SUSPENDED');

-- DropIndex
DROP INDEX "patient_subscriptions_tenant_id_patient_id_idx";

-- AlterTable
ALTER TABLE "patient_subscriptions" DROP COLUMN "stripe_subscription_id",
ADD COLUMN     "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "current_period_end" TIMESTAMP(3),
ADD COLUMN     "product_id" TEXT NOT NULL,
ADD COLUMN     "provider" "PaymentProvider" NOT NULL,
ADD COLUMN     "provider_subscription_id" TEXT NOT NULL,
ALTER COLUMN "stripe_account_id" DROP NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "PatientSubscriptionStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "operations_email" TEXT;

-- CreateTable
CREATE TABLE "tenant_store_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" "AppPlatform" NOT NULL,
    "account_type" "StoreAccountType" NOT NULL DEFAULT 'INDIVIDUAL',
    "account_email" TEXT NOT NULL,
    "external_account_id" TEXT,
    "status" "StoreAccountStatus" NOT NULL DEFAULT 'MAILBOX_CREATED',
    "api_credential_ref" TEXT,
    "enrolled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_store_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "document_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "patient_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_store_accounts_tenant_id_idx" ON "tenant_store_accounts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_store_accounts_tenant_id_platform_key" ON "tenant_store_accounts"("tenant_id", "platform");

-- CreateIndex
CREATE INDEX "patient_consents_tenant_id_patient_id_kind_idx" ON "patient_consents"("tenant_id", "patient_id", "kind");

-- CreateIndex
CREATE INDEX "patient_subscriptions_tenant_id_patient_id_status_idx" ON "patient_subscriptions"("tenant_id", "patient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "patient_subscriptions_provider_provider_subscription_id_key" ON "patient_subscriptions"("provider", "provider_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_operations_email_key" ON "tenants"("operations_email");

-- AddForeignKey
ALTER TABLE "tenant_store_accounts" ADD CONSTRAINT "tenant_store_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_consents" ADD CONSTRAINT "patient_consents_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

