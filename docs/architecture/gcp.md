# GCP architecture

One GCP project, **`limon-preproduction`** in `us-east1`, is the only cloud environment during the MVP. It's managed with Terraform in `infrastructure/terraform/environments/preproduction`. Why GCP: [ADR-010](adr/ADR-010-gcp-infrastructure.md). How we got here: [GCP migration](../roadmap/gcp-migration.md).

## `preproduction`

```
Patient apps ─HTTPS─▶ api.projectlimon.com (Cloud Run domain mapping, Google-managed certificate)
                         └─▶ Cloud Run service "api" (public, min 0 / max 3)
                                ├─▶ Cloud SQL PostgreSQL 16 (private IP)
                                ├─▶ Pub/Sub topic "jobs" ─push (OIDC)─▶ Cloud Run service "worker" (private, IAM only)
                                │                          └─ 5 failed deliveries ─▶ jobs-dlq
                                └─▶ Cloud Storage bucket (tenant files, V4 signed URLs)
Nutritionists ─HTTPS─▶ app.projectlimon.com ─▶ Cloud Run service "dashboard" (public, min 0 / max 2)
                         └─ /api/v1 proxy (session cookie) ─▶ api.projectlimon.com
Cloud Scheduler ─▶ worker: FatSecret cache refresh (every 15 min), weekly plans (Sundays, paused)
api + worker egress ─▶ Direct VPC egress ─▶ Cloud NAT + reserved static IP ─▶ FatSecret · Stripe · Google APIs
Identity Platform (one tenant per nutritionist) · Secret Manager · Artifact Registry · Cloud Logging / Monitoring
GitHub Actions ─Workload Identity Federation─▶ limon-deployer: build, push, migrate, deploy
```

- Used by the pilot nutritionists and their patients, so it holds real health data. Cloud SQL has deletion protection (in Terraform and in the API), 7 days of backups with point-in-time recovery, and the tenant bucket refuses to be deleted while it has objects.
- Disposable: a separate `production` project replaces it after the MVP. Local development uses `docker compose` and dev auth. There's no development or staging project.
- All outbound traffic from `api` and `worker` goes through the VPC and leaves through **Cloud NAT with one reserved IP** (`terraform output nat_ip`), because FatSecret only accepts whitelisted IPs.
- Cloud SQL has no public IP. Only the services on the VPC reach it.
- `APP_ENV=preproduction` in both services.

### Files (`infrastructure/terraform/environments/preproduction`)

| File | Resources |
|---|---|
| `backend.tf` | State in `gs://limon-tfstate-a175b1` (versioned), Google provider |
| `main.tf` | Project APIs, network module (VPC, subnet, Cloud NAT + static IP, private services access), Artifact Registry `limon`, Secret Manager secrets |
| `iam.tf` | Service accounts: `limon-api`, `limon-worker`, `limon-dashboard`, `limon-scheduler`, `limon-pubsub-push`, `limon-deployer`, and their roles |
| `database.tf` | Cloud SQL `limon-pre` (`db-f1-micro`, 10 GB SSD, zonal) and the `migrate` Cloud Run job |
| `identity.tf` | Identity Platform with multi-tenancy on. Identity tenants are created by the API, not here |
| `api.tf` | The `api` service, its public invoker and the `api.projectlimon.com` domain mapping |
| `dashboard.tf` | The `dashboard` service (no VPC access), its public invoker and the `app.projectlimon.com` domain mapping |
| `jobs.tf` | The `worker` service, Pub/Sub `jobs` + `jobs-dlq`, Cloud Scheduler jobs |
| `storage.tf` | Bucket `limon-pre-tenant-assets` |
| `cicd.tf` | Workload Identity Federation for GitHub Actions |
| `monitoring.tf` | Uptime check and alert policies |

**Shared services only:** no per-tenant services, databases or projects.

### Estimated cost (us-east1 list prices — verify in the [pricing calculator](https://cloud.google.com/products/calculator))

| Item | ≈ USD / month |
|---|---|
| Cloud Run `api` (min 0) and `worker`; pilot traffic fits the free tier | 0–4 |
| Cloud SQL PostgreSQL 16, `db-f1-micro`, 10 GB SSD, backups | 10–12 |
| Cloud NAT + reserved static IP | 5–6 |
| Secret Manager, Artifact Registry | 1–2 |
| Identity Platform (free tier), Pub/Sub, Cloud Scheduler, Cloud Storage, Logging, Monitoring | ~0 |
| **Total** | **≈ 17–24** |

A budget alert at MXN 1,000 (≈ US$50) is set on the billing account.

### Known limits

- **`api` scales to zero.** The first request after a quiet period waits for a cold start (a few seconds). Production sets min 1 (≈ +US$10).
- **Micro database** (shared core, 0.6 GB RAM) and **zonal**: a zone outage is an outage. The Cloud SQL alert fires at 80% CPU or disk.
- **Domain mapping is a pre-GA feature.** Production uses a global external load balancer (≈ US$18+/month), which also brings Cloud Armor.
- **No WAF.** Fastify rate limits only.

## Deploying

### Every change: GitHub Actions

A merge to `main` runs CI, and once CI passes, `.github/workflows/deploy.yml`:

1. builds the `api` image (`apps/api/Dockerfile`), the `migrate` image (`packages/database/Dockerfile`) and the `dashboard` image (`apps/dashboard/Dockerfile`), tagged with the short commit hash, and pushes them to Artifact Registry;
2. runs the `migrate` job (creates `limon_app` if missing, `prisma migrate deploy`, seed) and waits for it;
3. deploys `api`, then `worker` (same image, command `node dist/jobs/worker.js`), then `dashboard`;
4. checks `https://api.projectlimon.com/health` and `https://app.projectlimon.com/login`.

The `api` revision already running keeps serving during step 2, so a migration must not break it. The workflow can also be started by hand from the Actions tab (on `main` only). It authenticates as `limon-deployer` through Workload Identity Federation, which only accepts workflows on `main` of this repository, so there are no keys in GitHub.

By hand, the same steps are:

```bash
TAG=$(git rev-parse --short HEAD)
REPO=us-east1-docker.pkg.dev/limon-preproduction/limon
docker build --platform linux/amd64 -f apps/api/Dockerfile -t $REPO/api:$TAG . && docker push $REPO/api:$TAG
docker build --platform linux/amd64 -f packages/database/Dockerfile -t $REPO/migrate:$TAG . && docker push $REPO/migrate:$TAG
gcloud run jobs update migrate --region us-east1 --image $REPO/migrate:$TAG
gcloud run jobs execute migrate --region us-east1 --wait
gcloud run deploy api --region us-east1 --image $REPO/api:$TAG
gcloud run deploy worker --region us-east1 --image $REPO/api:$TAG --command=node --args=dist/jobs/worker.js
docker build --platform linux/amd64 -f apps/dashboard/Dockerfile -t $REPO/dashboard:$TAG . && docker push $REPO/dashboard:$TAG
gcloud run deploy dashboard --region us-east1 --image $REPO/dashboard:$TAG
```

### Infrastructure changes: Terraform

```bash
cd infrastructure/terraform/environments/preproduction
terraform plan     # read it
terraform apply
```

`alert_email` has no default, because the repository is public. Put it in `terraform.tfvars` (gitignored) or export `TF_VAR_alert_email`. CI runs `terraform fmt -check` and `terraform validate`, but never `apply`. Never change Terraform-managed resources in the console. Terraform ignores the services' and job's image and command, since deploys set those.

### Setting up a new project (once)

What Terraform can't do, in order:

1. **Project and state:** create the project, link billing, create the state bucket, then `terraform init` and `terraform apply` ([migration phases 0–2](../roadmap/gcp-migration.md)).
2. **Secrets:** add a version to each secret in Secret Manager (`db-app-password`, `db-owner-password`, `fatsecret-client-id`, `fatsecret-client-secret`).
3. **Domain** (DNS for `projectlimon.com` is at **Hostinger**: hPanel → Domains → DNS records; Hostinger appends the domain, so enter only the part before `.projectlimon.com`):
   - Verify `projectlimon.com` in Google Search Console **with the account that runs Terraform** (a **TXT** record on `@`). Until then `apply` fails on the domain mapping.
   - **CAA:** `0 issue "pki.goog"` must be allowed, or the certificate is never issued.
   - **CNAME** `api` → `ghs.googlehosted.com` (`terraform output api_domain_dns_records`). The certificate takes ~15 minutes, up to 24 hours: `gcloud beta run domain-mappings describe --domain api.projectlimon.com --region us-east1`.
   - **CNAME** `app` → `ghs.googlehosted.com` (`terraform output dashboard_domain_dns_records`), the same way for the dashboard.
4. **FatSecret:** whitelist `terraform output nat_ip` in the FatSecret developer portal.
5. **First deploy:** run the deploy workflow, or the commands above.
6. **Practices:** `admin identity-tenant <slug>` for any practice created before Identity Platform, then put the printed id in `apps/patient/tenants/<slug>/tenant.json` as `identityTenantId`.
7. **App builds:** `APP_TENANT=<slug> eas build --profile preproduction`. The profile has the api URL and the auth domain. Set `EXPO_PUBLIC_FIREBASE_API_KEY` from `terraform output -json identity_platform` as an EAS environment variable (and the `FIREBASE_API_KEY` repository variable for `mobile-build.yml`).

### Tearing it down

Both Cloud SQL guards must be turned off first, on purpose: set `deletion_protection = false` and `deletion_protection_enabled = false` in `modules/database/main.tf`, `apply`, then `terraform destroy`. The tenant bucket refuses to go while it has objects, so export what must move to production, then empty it. The state bucket, the Search Console verification and the Hostinger records stay until they're removed by hand.

## Monitoring

`monitoring.tf` sends alerts by email to `alert_email`:

| Alert | Fires when |
|---|---|
| api is down | The uptime check on `https://api.projectlimon.com/health` (every 5 minutes) fails from 2+ regions |
| api 5xx errors | More than 5 server errors in 5 minutes |
| Job dead-lettered | Any message in `jobs-dlq`, meaning a job failed 5 deliveries. `gcloud pubsub subscriptions pull jobs-dlq --limit=10` shows it |
| Cloud SQL CPU or disk high | CPU or disk above 80% for 10 minutes |

Logs are in Cloud Logging, per Cloud Run service.

## Region

`us-east1` for the MVP (open decision #6). `northamerica-south1` (Querétaro) is worth evaluating for the production project. Check Identity Platform, Cloud SQL tiers and Vertex AI model availability there first.

## Secrets and environment

- Local: `.env` (gitignored), from `.env.example`.
- Cloud: non-secret configuration is set on the Cloud Run services in Terraform (`local.service_env` in `api.tf`). Secrets come from Secret Manager as environment variables (`local.service_secrets`). `DATABASE_URL` is assembled at container start from `DB_HOST` and the password. Apps read only `process.env`, validated at boot by `@limon/config`.

## Remaining gaps

- The `production` project: min 1 instance on `api`, a load balancer with Cloud Armor, a high-availability database ([migration, "Before production"](../roadmap/gcp-migration.md#before-production)).
- A CDN for public branding assets.
- Transactional email (Resend, with Stripe payments).
