# GCP migration (from AWS)

**Decided:** 2026-10-08 · **Window:** Thu Oct 8 → Wed Oct 21 (AWS cleanup now, then 8 working days from Oct 12) · **Region:** `us-east1` · **Infrastructure as code:** Terraform · Part of the [MVP roadmap](mvp-roadmap.md#gcp-migration)

## Why

The deciding reason is **experience**, not cost: the platform is run by one developer who knows GCP better than AWS, and that person will be the one debugging production at night. The two clouds cost about the same for this setup (~US$27–35/month on GCP, ~US$35–40 on AWS).

Other reasons:

- **Identity Platform has multi-tenancy built in.** Each nutritionist gets their own identity tenant, which gives ADR-006 (the same email can be a patient of several nutritionists) natively. It replaces the `tenantId#email` Cognito username workaround.
- **No lock-in on passwords.** Cognito can't export password hashes, so leaving it later would force every patient to reset their password. Identity Platform can export them. **Moving now, before any pilot patient signs up, costs nothing in user migration.**
- **A fixed outbound IP is cheaper.** FatSecret only accepts whitelisted IPs. Cloud NAT with a reserved IP costs ~US$5/month, against ~US$37 for an AWS NAT gateway (and no hand-run NAT instance).
- **Nothing in the app needs AWS.** The code that touches AWS is small: a 31-line token verifier, the patient app's sign-in (93 lines), the job queue and worker, and the file storage helper. Postgres, Prisma and the RLS policies move unchanged.

### What we give up, and how it's covered

| AWS feature | On GCP | Impact |
|---|---|---|
| SES (email sending) | No GCP equivalent | None yet: the app sends no email of its own. Identity Platform sends verification and password-reset emails itself. Transactional email later (invites, receipts) uses Resend, Postmark or SendGrid. |
| Cognito's 6-digit email code | Identity Platform emails a **verification link** | The Confirm Sign-Up screen becomes "open the link in your email, then continue". |
| An always-running SQS worker | Cloud Run stops idle instances and throttles CPU between requests | The worker becomes HTTP endpoints: Pub/Sub pushes jobs to it, Cloud Scheduler calls the 15-minute FatSecret cache refresh and the Sunday plan job. |
| API Gateway + ACM custom domain | Cloud Run **domain mapping**, which is a pre-GA preview | Fine for `preproduction`. `production` uses a global external load balancer (~US$18+/month), which also brings Cloud Armor. |
| CDK in TypeScript | Terraform (HCL) | New language for the infrastructure, but a small one and the standard for GCP. See [Terraform in five minutes](#terraform-in-five-minutes). |
| Bedrock (for the AI add-on, after the MVP) | Vertex AI, which offers both Claude and Gemini | None for the MVP. |

## Target: `preproduction` on GCP

One GCP project, **`limon-preproduction`**, in `us-east1`. Same role as on AWS: the only cloud environment during the MVP, used by the pilot, replaced by a separate `production` project after the MVP.

```
Patient apps ─HTTPS─▶ api.projectlimon.com (Cloud Run domain mapping, Google-managed certificate)
                         └─▶ Cloud Run service "api" (public, min 1 instance)
                                ├─▶ Cloud SQL PostgreSQL 16 (private IP)
                                ├─▶ Pub/Sub topic "jobs" ─push─▶ Cloud Run service "worker" (private, IAM only)
                                └─▶ Cloud Storage bucket (tenant files, V4 signed URLs)
Cloud Scheduler ─▶ worker: FatSecret cache refresh (every 15 min), weekly plans (Sunday)
api + worker egress ─▶ Direct VPC egress ─▶ Cloud NAT + reserved static IP ─▶ FatSecret · Stripe · Google APIs
Identity Platform (one tenant per nutritionist) · Secret Manager · Artifact Registry · Cloud Logging / Monitoring
```

Estimated monthly cost (us-east1 list prices — verify in the [GCP pricing calculator](https://cloud.google.com/products/calculator)):

| Item | ≈ USD / month |
|---|---|
| Cloud Run `api`: 1 vCPU / 512 MiB, **min 1 instance** (avoids cold starts, which Cloud NAT can stretch past 30 s) | 10–15 |
| Cloud Run `worker`: scales to zero; ~3,000 short runs a month fit the free tier | 0–2 |
| Cloud SQL PostgreSQL 16, `db-f1-micro` (shared core), 10 GB SSD, 7-day backups | 10–12 |
| Cloud NAT + reserved static IP (the IP FatSecret whitelists) | 5–6 |
| Secret Manager, Artifact Registry | 1–2 |
| Identity Platform (free tier covers the pilot), Pub/Sub, Cloud Scheduler (3 free jobs), Cloud Storage, Logging, uptime checks | ~0 |
| **Total** | **≈ 27–35** |

Accepted for the pilot, as on AWS: one database without high availability, no WAF (Fastify rate limits only), a preview custom-domain feature, and no staging environment.

## To-do

Check items off here as they land. Each phase ends with a **Done when**.

### Phase 0 · Accounts and tools (Oct 8, ~1 h)

- [x] Create the GCP project `limon-preproduction`, link a billing account, and set a **budget of US$50/month** with email alerts at 50 / 90 / 100 %. *(The billing account is in MXN, so the budget is **MXN 1,000/month**, ≈ US$50.)*
- [ ] Apply for the [Google for Startups Cloud Program](https://cloud.google.com/startup) credits.
- [x] Install the `gcloud` CLI and **Terraform** (≥ 1.9) locally; `gcloud auth login` and `gcloud auth application-default login`.
- [x] Create a versioned Cloud Storage bucket for the Terraform state (`limon-tfstate-<random>`), by hand, once. *(Bucket: **`limon-tfstate-a175b1`**, us-east1, public access prevented.)*

**Done when:** `terraform init` works against the state bucket and the budget alert exists.

### Phase 1 · Clean up AWS (Oct 8–9, 1–2 h) — stop all AWS charges

Some resources are still running and some were deleted by hand, so CloudFormation stacks may be stuck. Our CDK code also **kept some resources on purpose** when a stack is deleted (`RETAIN`). Earlier deploys may have used the old `limon-dev` / `limon-stg` prefixes, so look for all three: `limon-dev`, `limon-stg`, `limon-pre`.

1. **See what's charging.** Billing console → *Bills* (current month, by service and region), and *Cost Explorer* grouped by **Service** and then by **Region**. Note every service with a cost.
2. **Find everything we created.** All our resources carry the tag `project=limon`. Run this in each region you used (at least `us-east-1`; also `mx-central-1` if you ever tried it):
   ```bash
   aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=limon --region us-east-1 \
     --query 'ResourceTagMappingList[].ResourceARN' --output text
   ```
3. **Delete the CloudFormation stacks**, newest dependency first: `*-monitoring`, `*-compute`, `*-database`, then `*-network`, `*-storage`, `*-auth`, `*-queues`.
   ```bash
   aws cloudformation list-stacks --region us-east-1 \
     --query "StackSummaries[?starts_with(StackName,'limon-') && StackStatus!='DELETE_COMPLETE'].[StackName,StackStatus]" --output table
   aws cloudformation delete-stack --stack-name <name> --region us-east-1
   ```
   A stack in `DELETE_FAILED` names the resource that blocked it (Events tab). Delete that resource by hand, then delete the stack again. If it still fails, delete with *Retain* on that resource and remove the resource yourself.
4. **Delete what the stacks keep on purpose:**
   - [x] **Cognito user pool** `limon-*-users`: turn off *Deletion protection*, then delete it.
   - [x] **S3 bucket** `limon-*-tenant-assets-<account>`: it's versioned, so use the console's **Empty** button (removes every version), then delete it.
   - [x] **RDS:** delete leftover instances or Aurora clusters, every manual snapshot (`aws rds describe-db-snapshots --snapshot-type manual`, `aws rds describe-db-cluster-snapshots --snapshot-type manual`) and retained automated backups (RDS → *Automated backups* → *Retained*).
   - [x] **CloudWatch log groups** `/limon-*/...`.
   - [x] **Secrets Manager** `limon-*/...`: deleted secrets wait 7–30 days; force it with `aws secretsmanager delete-secret --secret-id <id> --force-delete-without-recovery`.
5. **Hunt the usual hidden costs** (EC2 and VPC consoles, each region):
   - [x] **Elastic IPs** (charged even when not attached), **NAT gateways**, NAT **EC2 instances** and their **EBS volumes**.
   - [x] **Load balancers**, **target groups**, **ECS clusters and services**.
   - [x] **WAF web ACLs** (US$5/month each), **API Gateway** APIs and **VPC links**, **Cloud Map** namespaces (each keeps a Route 53 private hosted zone at US$0.50/month).
   - [x] **VPCs** named `limon-*` (deleting a VPC removes its subnets, endpoints and security groups).
6. **Remove the CDK bootstrap**, if nothing else in the account uses CDK: empty and delete the `cdk-hnb659fds-assets-*` S3 bucket and the `cdk-hnb659fds-container-assets-*` ECR repository, then delete the `CDKToolkit` stack.
7. **Confirm zero.** Keep an AWS budget of US$1/month for one month. If no alert fires, either leave the empty account or **close it** (Account → *Close account*; AWS keeps it suspended for 90 days and then deletes it).
8. [ ] Remove the old AWS IP from the FatSecret whitelist, if it was ever added.

**Done when:** Cost Explorer shows no new AWS charges for 2 consecutive days, and the tag search returns nothing in every region.

### Phase 2 · Terraform foundation (Oct 12)

New folder `infrastructure/terraform/`, replacing the CDK app (`infrastructure/*.ts`, `cdk.json`), which is deleted in phase 9.

- [x] Layout: `modules/` (network, database, run-service, jobs, storage, secrets) and `environments/preproduction/` (`main.tf`, `variables.tf`, `backend.tf` pointing at the state bucket). `production` gets its own folder later. *(network, database and secrets exist; run-service, jobs and storage come with phases 5–7.)*
- [x] Enable the project APIs: Cloud Run, Cloud SQL Admin, Service Networking, Compute (VPC/NAT), Pub/Sub, Cloud Scheduler, Secret Manager, Artifact Registry, Identity Toolkit (Identity Platform), IAM Credentials, Cloud Monitoring.
- [x] **Network:** VPC `limon` with one `us-east1` subnet for Direct VPC egress, a Cloud Router, a **reserved static IP** and **Cloud NAT** using only that IP. Output the IP (`nat_ip`).
- [x] **Private Service Access** (peering range) so Cloud SQL gets a private IP.
- [x] **Artifact Registry** Docker repo `limon` in `us-east1`.
- [x] **Service accounts:** `api` (Cloud SQL client, Pub/Sub publisher, Storage object admin on the tenant bucket, Secret accessor, Identity Platform admin for account deletion, token creator on itself for signed URLs), `worker` (same, plus Pub/Sub subscriber), `scheduler` and `pubsub-push` (Cloud Run invoker on `worker` only), `deployer` (for CI). *(IDs must be 6–30 characters, so they are `limon-api`, `limon-worker`, … Roles on a single resource — topic, bucket, `worker` service — are granted when that resource is created, in phases 5 and 6.)*
- [x] **Secret Manager** entries (values set by hand, never in Terraform): `db-app-password`, `db-owner-password`, `fatsecret-client-id`, `fatsecret-client-secret`, later `stripe-secret-key`, `stripe-webhook-secret`.

**Done when:** `terraform plan` is clean after `apply`, and the NAT IP is known. **Whitelist that IP at FatSecret now.** *(Applied Oct 8; NAT IP **`35.243.170.34`**, whitelisted at FatSecret Oct 9; FatSecret secrets set.)*

### Phase 3 · Database (Oct 12)

- [x] **Cloud SQL** PostgreSQL 16, `db-f1-micro`, 10 GB SSD with auto-grow, private IP only, automated backups (7 days), deletion protection on (it holds pilot health data). Database `limon`, user `limon_owner`.
- [x] **Migration job:** a **Cloud Run Job** from the existing `packages/database/Dockerfile` that creates the `limon_app` role, runs `prisma migrate deploy` and seeds. Same steps as the ECS migrate task, now `gcloud run jobs execute migrate`.
- [x] Connection: the services use the private IP over Direct VPC egress. `DATABASE_URL` is assembled from secrets at start, as today (`apps/api/src/lib/bootstrap-database-url.ts`).

The image's entrypoint exports `DATABASE_URL` and `DATABASE_MIGRATION_URL`, then runs the command, so the same job runs the RLS tests with `--args`. The `limon_owner` password goes to Cloud SQL write-only (never in the Terraform state); after adding a new version of `db-owner-password`, bump `owner_password_version` in `database.tf`.

```bash
# 1. Create Cloud SQL and the job (the job starts on a placeholder image)
cd infrastructure/terraform/environments/preproduction && terraform apply

# 2. Build and push the image (from the repo root; Cloud Run runs amd64)
gcloud auth configure-docker us-east1-docker.pkg.dev
IMAGE=us-east1-docker.pkg.dev/limon-preproduction/limon/migrate:$(git rev-parse --short HEAD)
docker build --platform linux/amd64 -f packages/database/Dockerfile -t $IMAGE . && docker push $IMAGE
gcloud run jobs update migrate --region us-east1 --image $IMAGE

# 3. Migrate + seed, then the RLS tests against the same database
gcloud run jobs execute migrate --region us-east1 --wait
gcloud run jobs execute migrate --region us-east1 --wait \
  --args=npx,vitest,run,test/integration/tenant-isolation.test.ts
```

**Done when:** the migrate job runs every migration on an empty database, and the RLS isolation tests pass against it from a one-off job. *(Oct 9: image `migrate:3714be4`, all 16 migrations and the seed applied, 8/8 RLS tests passed.)*

### Phase 4 · Authentication: Cognito → Identity Platform (Oct 13–14, the largest piece)

Identity Platform with **multi-tenancy on** (`identity.tf`): one identity tenant per nutritionist. Tokens carry the tenant (`firebase.tenant` claim). The API still resolves the user and tenant **from our database** (authorization pipeline unchanged), and additionally rejects a token whose identity tenant doesn't match the user's tenant row.

API and packages:
- [x] `packages/auth`: replace `cognito.ts` (`aws-jwt-verify`) with an Identity Platform verifier (Firebase ID tokens: `firebase-admin` `verifyIdToken`, or `jose` against Google's public keys, checking issuer and audience for the project). Reject unverified emails (`email_verified: false`) except on the registration endpoint. `verifier.ts` keeps its interface; the `dev` provider is unchanged for local work.
- [x] Database migration: add `tenants.identity_tenant_id`; rename `users.cognito_user_id` → `auth_user_id` (and `resolveIdentity`, `app_resolve_identity()`, the seed and the tests that use it).
- [x] Provisioning: nutritionist sign-up / `admin` creates the Identity Platform tenant (email + password enabled, Spanish email templates, password policy ≥ 10 characters with upper, lower and digits, as on Cognito) and stores its id. *(Emails come out in Spanish from the app setting `auth.languageCode = 'es'`. Existing practices: `admin identity-tenant <slug>`. Nutritionists sign in at the project level, outside any identity tenant.)*
- [x] Tenant middleware (`apps/api/src/middleware/tenant-context.ts`): add the token-tenant vs. database-tenant check, with a test in `tenant-isolation.api.test.ts`.
- [x] **Account deletion** (`DELETE /patients/me`): the API deletes the Identity Platform user itself, through the tenant-scoped Admin SDK, in the same request. This replaces the app-side Cognito `DeleteUser` (Firebase's client-side delete requires a fresh sign-in, and a server-side delete leaves no orphaned login). Update `account-deletion.api.test.ts`.
- [ ] `DeleteTenantData` job *(still a skeleton; its plan now names `identityAdmin.deleteTenant`)*: delete the tenant's Identity Platform tenant (which deletes its users) instead of Cognito `AdminDeleteUser`.
- [x] `packages/config`: replace `COGNITO_*` with `GCP_PROJECT_ID` (and the Identity Platform API key if the verifier needs it).

Patient app:
- [ ] Replace `amazon-cognito-identity-js` and `crypto-polyfill.ts` with the Firebase JS SDK auth (`initializeAuth` with React Native persistence, `auth.tenantId = <the app's identity tenant>`). `apps/patient/src/features/auth/auth-provider.ts` keeps its interface.
- [ ] Build config: `tenants/<slug>/tenant.json` and `tenants/schema.ts` gain the Firebase web config (public API key, auth domain) and the nutritionist's `identityTenantId`; `tenantUsername()` is no longer used for sign-in. Update `app.config.ts` and `eas.json`.
- [ ] `ConfirmSignUpScreen` → "Te enviamos un enlace a tu correo": resend link, then "Ya lo confirmé" reloads the user and continues. Update `session-context.tsx` (verification step and the error-code mapping to Spanish messages).
- [ ] Password reset through Identity Platform's email.

Docs: ADR-006 (identity tenant per nutritionist instead of namespaced usernames), `authentication.md`, `authorization.md`, `multi-tenancy.md`, `mobile-white-label.md`.

**Done when:** locally (dev auth) and on `preproduction` (Identity Platform), a patient signs up in two different nutritionists' apps with the **same email** and gets two separate accounts; a token from tenant A is rejected on tenant B's app; account deletion removes the login.

### Phase 5 · Jobs: SQS → Pub/Sub + Cloud Scheduler (Oct 15)

- [ ] `apps/api/src/infrastructure/queue.ts`: publish the same job envelope (`packages/tenant/src/jobs.ts`) to the Pub/Sub topic `jobs`.
- [ ] Turn `apps/api/src/jobs/worker.ts` into **HTTP endpoints**, served by the same image as a second Cloud Run service `worker` (`--no-allow-unauthenticated`; only the `pubsub-push` and `scheduler` service accounts can invoke it, so no auth code is needed):
  - `POST /jobs`: receives a Pub/Sub push, runs the handler. A `2xx` acknowledges it; any other status retries with backoff, and after 5 attempts the message goes to the dead-letter topic `jobs-dlq`. Handlers stay idempotent.
  - `POST /maintenance/food-cache`: the FatSecret cache refresh, called by Cloud Scheduler every 15 minutes (replaces the `setInterval` in the worker).
  - `POST /maintenance/weekly-plans`: the **Sunday plan job** still open in week 4, called by Cloud Scheduler on Sundays (time zone `America/Mexico_City`).
- [ ] Terraform: topic, push subscription with OIDC auth, dead-letter topic, the Scheduler jobs, and the `worker` service.
- [ ] Local development: keep running handlers in-process (no Pub/Sub emulator needed), behind the same publisher interface.
- [ ] `packages/config`: `SQS_JOBS_QUEUE_URL` → `PUBSUB_JOBS_TOPIC`.

**Done when:** a published job runs once on `worker`; a failing job lands in `jobs-dlq`; the food cache refreshes every 15 minutes in the logs.

### Phase 6 · File storage: S3 → Cloud Storage (Oct 15)

- [ ] `apps/api/src/infrastructure/storage.ts`: `@google-cloud/storage` with **V4 signed URLs** (the `api` service account signs through IAM, hence the token-creator role). Same `TenantStorage` interface, same `tenants/{tenantId}/…` keys.
- [ ] Bucket `limon-pre-tenant-assets`: uniform access, public access prevention, versioning, the `tmp/` 1-day lifecycle rule (as on S3).
- [ ] `DeleteTenantData`: delete the `tenants/{tenantId}/` prefix in Cloud Storage.
- [ ] `packages/config`: `S3_TENANT_BUCKET` → `GCS_TENANT_BUCKET`; remove `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.

**Done when:** an upload URL works from the app and a download URL expires as configured.

### Phase 7 · Deploy, domain and DNS (Oct 16)

- [ ] Cloud Run `api`: 1 vCPU / 512 MiB, min 1 / max 3 instances, Direct VPC egress with **all traffic** through the VPC (so every outbound call uses the NAT IP), secrets mounted as environment variables, `APP_ENV=preproduction`. `worker`: same image, min 0.
- [ ] **Domain** `api.projectlimon.com` with a Cloud Run domain mapping (us-east1 supports it):
  1. Verify `projectlimon.com` in Google Search Console: add the **TXT** record it gives you at Hostinger (name `@`).
  2. Create the mapping (`gcloud beta run domain-mappings create --service api --domain api.projectlimon.com --region us-east1`).
  3. At Hostinger, replace the old AWS `api` record with **CNAME** `api` → `ghs.googlehosted.com`, and delete the old ACM validation CNAME (`_<hash>.api`).
  4. Wait for the Google-managed certificate (usually ~15 minutes, up to 24 hours).
- [ ] Hostinger CAA records, if any: add `0 issue "pki.goog"` (Google's certificate authority); the `amazon.com` one can go.
- [ ] Run the migrate job, then `curl https://api.projectlimon.com/health`.

**Done when:** the app, built with the `preproduction` profile, signs up, onboards and loads a meal plan with macros (FatSecret reached through the NAT IP).

### Phase 8 · CI/CD and monitoring (Oct 19–20)

- [ ] GitHub Actions authenticates to GCP with **Workload Identity Federation** (no JSON keys in GitHub secrets).
- [ ] `ci.yml`: replace the `cdk synth` step with `terraform fmt -check` and `terraform validate`.
- [ ] Deploy workflow (on merge to `main`, or by hand while solo): build the image, push it to Artifact Registry, run the migrate job, deploy `api` and `worker`.
- [ ] `mobile-build.yml`: the Firebase config and identity tenant per app, instead of the Cognito ids.
- [ ] Monitoring: an **uptime check** on `/health` with an email alert; alerts for `api` 5xx rate, undelivered messages in `jobs-dlq`, and Cloud SQL CPU and disk.

**Done when:** a merge to `main` deploys without manual steps, and stopping the `api` service triggers the uptime alert.

### Phase 9 · Remove AWS from the repo and docs (Oct 21)

- [ ] Delete the CDK app: `infrastructure/app.ts`, `cdk.json`, `cdk.context.json`, `config/`, `stacks/`, and the CDK dependencies in `infrastructure/package.json`.
- [ ] Remove the leftover AWS packages (`@aws-sdk/*`, `aws-jwt-verify`, `amazon-cognito-identity-js`) and Bedrock/SES mentions.
- [ ] **ADR-010: GCP infrastructure**, superseding ADR-005 (this document's "Why" section is the starting point). Update ADR-004 (worker model).
- [ ] Replace `docs/architecture/aws.md` with `gcp.md` (architecture, costs, deploy and teardown steps, Hostinger DNS). Update `overview.md`, `tenant-lifecycle.md`, `README.md` and `.env.example`.

**Done when:** `grep -ri "cognito\|aws-sdk\|cdk" --exclude-dir=node_modules .` finds only historical mentions in ADR-005 and this document.

## Terraform in five minutes

Terraform describes infrastructure in text files (`.tf`, a language called HCL), the way CDK did in TypeScript:

```hcl
resource "google_sql_database_instance" "main" {
  name             = "limon-pre"
  database_version = "POSTGRES_16"
  region           = "us-east1"
  settings { tier = "db-f1-micro" }
}
```

- `terraform init` downloads the Google provider and connects to the **state** (a file in the GCS bucket that records what exists, so Terraform knows what to change).
- `terraform plan` shows exactly what would be created, changed or destroyed. Nothing happens yet. **Always read it.**
- `terraform apply` makes those changes, after asking for confirmation.
- `terraform destroy` removes everything the configuration manages (that's how `preproduction` is torn down after the MVP).
- Change a `.tf` file, `plan`, `apply`. Never change Terraform-managed resources in the console: the next `plan` would undo it.

Secrets values, the Search Console verification and the Hostinger records stay manual on purpose.
