# ADR-010: GCP infrastructure

**Status:** Accepted · 2026-10-08 · Supersedes [ADR-005](ADR-005-aws-infrastructure.md)

## Context
ADR-005 put the platform on AWS with CDK. By early October the only deployed environment was a minimal `preproduction`, with no pilot patients signed up yet. The platform is run by one developer, who knows GCP better than AWS and will be the one debugging it at night. Moving later would mean migrating real logins and data.

## Decision
GCP, region `us-east1`, managed with **Terraform**. One project per environment: `limon-preproduction` during the MVP, a separate `production` project after it.

- **Cloud Run** for the `api` (public) and the `worker` (private, IAM only), from the same image. Shared, never per tenant.
- **Cloud SQL PostgreSQL 16** with a private IP only. Prisma, the migrations and the RLS policies are unchanged.
- **Identity Platform with multi-tenancy:** one identity tenant per nutritionist, so the same email can be a patient of several nutritionists (ADR-006). Nutritionists sign in at the project level.
- **Pub/Sub** pushes jobs to the worker's HTTP endpoints, with a dead-letter topic. **Cloud Scheduler** calls the worker's maintenance endpoints. See ADR-004.
- **Cloud Storage**, one private bucket with `tenants/{tenantId}/` keys and V4 signed URLs.
- **Cloud NAT with a reserved IP** for all outbound traffic (FatSecret whitelists it).
- **Secret Manager**, **Artifact Registry**, **Cloud Logging and Monitoring**.
- **GitHub Actions** deploys with Workload Identity Federation (no service account keys).

Details, costs and runbooks: [gcp.md](../gcp.md). The migration: [GCP migration](../../roadmap/gcp-migration.md).

## Alternatives considered
- **Stay on AWS** (ADR-005). Similar cost (~US$35–40/month against ~US$17–24). But it's the less familiar cloud, needs Cognito's `tenantId#email` username workaround for ADR-006, and Cognito can't export password hashes, so leaving it later would force every patient to reset their password.

## Consequences
+ Identity tenants give ADR-006 natively, and Identity Platform can export password hashes.
+ A fixed outbound IP costs ~US$5/month (an AWS NAT gateway costs ~US$37).
+ The worker scales to zero between jobs, and CI deploys without stored keys.
− No email sending service: Identity Platform sends its own emails, and transactional email will use a third party (Resend).
− Verification is a link instead of a 6-digit code.
− Cloud Run's domain mapping is pre-GA. Production needs a load balancer (≈ US$18+/month).
− Terraform (HCL) is a second language in the repository.
