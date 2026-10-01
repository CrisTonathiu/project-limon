# AWS Architecture

Two profiles live in `infrastructure/config/environments.ts`. Only `preproduction` is deployed during the MVP.

## `preproduction` (deployed, < US$50/month)

```
Patient apps ─HTTPS─▶ api.projectlimon.com
                      API Gateway HTTP API (ACM cert, stage throttling 50 rps / burst 100)
                         └─ VPC link ─▶ Cloud Map (SRV) ─▶ ECS Fargate task (private subnet)
                                                            ├─ api      (essential)
                                                            └─ worker   (SQS consumer + FatSecret cache refresh,
                                                                         non-essential sidecar)
ECS task ─▶ RDS PostgreSQL 16, db.t4g.micro, single-AZ (isolated subnets, not public)
         ─▶ S3 (VPC gateway endpoint)
         ─▶ NAT instance t4g.nano + Elastic IP (public subnet) ─▶ FatSecret · Stripe · Cognito · SQS ·
                                                                Secrets Manager · ECR · Bedrock · SES
Alarms (API 5xx, API CPU, DLQ depth) ─▶ CloudWatch
```

- Used by the pilot nutritionists and their patients, so it holds real health data: encrypted storage, 7-day backups, a final DB snapshot on deletion, and the Cognito user pool and S3 bucket are retained if the stack is destroyed.
- Disposable: it is replaced by a real `production` environment (separate AWS account) after the MVP. Local development uses `docker compose` and dev auth; there is no development or staging environment in AWS.
- Tasks run in private subnets. All outbound traffic leaves through **one NAT instance with an Elastic IP** (the `NatPublicIps` output), because FatSecret only accepts whitelisted IPs. A NAT instance costs ~US$7.50/month against ~US$37 for a NAT gateway; the trade-off is that it's a single instance you own (if it fails, outbound calls stop until CloudFormation or you replace it; the Elastic IP stays the same).
- The task security group only admits port 4000 from the VPC link's security group; the database security group only admits the tasks.
- `APP_ENV=preproduction` inside the containers.

### Estimated cost (us-east-1 list prices — verify in the AWS Pricing Calculator)

| Item | ≈ USD / month |
|---|---|
| RDS `db.t4g.micro` single-AZ + 20 GB gp3 | 14 |
| Fargate ARM 0.25 vCPU / 1 GB (api + worker) | 8.50 |
| NAT instance `t4g.nano` + 8 GB disk + Elastic IP | 7.50 |
| API Gateway HTTP API (US$1 / million requests) | 1–3 |
| Secrets Manager ×3, Cloud Map, CloudWatch logs + 4 alarms | 3–5 |
| Cognito (≤ 10k MAU), S3, SQS, ACM, VPC link | ~0 |
| **Total** | **≈ 35–40** |

### Known limits

- **One task.** A task restart or deploy failure is a short outage. Deploys start the new task before stopping the old one (`minHealthyPercent: 100`).
- **0.25 vCPU** is shared by the API and the worker. If latency suffers, raise `api.cpu` to 512 (≈ +US$7).
- **Micro database** (1 GB RAM, burstable CPU). Watch CPU credits; move to `small` if they run out.
- **Client IP behind API Gateway.** Fastify runs with `trustProxy: true`. After the first deploy, confirm the per-IP rate limits see the caller's address and not the VPC link's; if not, key those limits by user or invite code instead.
- **No WAF.** API Gateway throttling and Fastify rate limits only.

## `production-scale` (not deployed, `allowSynth: false`)

The original production design, kept so scaling up is a config change:

```
Internet ─▶ WAF ─▶ ALB (public subnets, HTTPS with the same ACM flow)
                   ├─ /api/*  ─▶ ECS api       (private subnets, 3 NAT gateways)
                   └─ /*      ─▶ ECS dashboard (private subnets)
                   ECS worker service ◀─ SQS (jobs, tenant-deletion) + DLQs
ECS tasks ─▶ Aurora PostgreSQL Serverless v2 (writer + reader, isolated subnets)
```

≈ US$700/month as configured. A real `production` profile will likely sit between the two (2 API tasks, ALB + WAF, Multi-AZ RDS `small`, 1 NAT gateway).

## Stacks (`infrastructure/`, CDK TypeScript)

| Stack | Resources |
|---|---|
| network | VPC (`maxAzs` AZs), public / private app / isolated subnets, NAT instance + Elastic IP or NAT gateways (`egress`), `NatPublicIps` output, S3 gateway endpoint, SGs (ingress → app → DB only) |
| database | RDS PostgreSQL 16 instance **or** Aurora PG 16 Serverless v2 (`database.kind`), encrypted, IAM auth, owner secret (with host) + app-user secret |
| storage | private tenant-assets bucket (BPA, SSE, TLS-only, versioned, retained) |
| auth | Cognito user pool (retained, deletion-protected), dashboard + patient-apps clients |
| queues | jobs queue + tenant-deletion queue, each with DLQ, SSE |
| compute | ECS cluster; API service (+ worker sidecar or worker service, + dashboard when enabled); ingress = API Gateway HTTP API + VPC link + Cloud Map, **or** ALB (+ WAF); ACM certificate + custom domain; migrate task definition |
| monitoring | API 5xx (from whichever ingress), API CPU, DLQ depth alarms |

**Shared services only** — no per-tenant ECS services, databases, or stacks.

## Deploying `preproduction`

Prerequisites: AWS credentials for the target account, Docker running (images are built for ARM64; on an x86 machine Docker needs `buildx`/QEMU), and access to the Hostinger DNS of `projectlimon.com`.

```bash
cd infrastructure
npx cdk bootstrap aws://<ACCOUNT_ID>/us-east-1     # once per account/region
pnpm deploy:pre                                     # cdk deploy --all -c env=preproduction
```

DNS for `projectlimon.com` is managed in **Hostinger** (hPanel → Domains → `projectlimon.com` → **DNS / Nameservers** → DNS records). Hostinger appends the domain to every name, so enter only the part before `.projectlimon.com`.

0. **Before the first deploy, check CAA records.** If the zone has any `CAA` records, Amazon must be allowed to issue certificates or validation fails with `CAA_ERROR`. Add `CAA` · name `@` · flag `0` · tag `issue` · value `amazon.com`. No CAA records at all also works.
1. **Certificate validation (first deploy only).** The compute stack waits while ACM validates `api.projectlimon.com`. In the ACM console (region us-east-1), open the pending certificate and copy its CNAME. Add it in Hostinger:

   | Type | Name | Points to / Target | TTL |
   |---|---|---|---|
   | CNAME | `_<hash>.api` (the ACM name without `.projectlimon.com.`) | `_<hash>.<...>.acm-validations.aws` (the ACM value, trailing dot optional) | default |

   Keep this record forever: ACM uses it to renew the certificate automatically. The deploy continues once it validates (usually 5–30 minutes; Hostinger propagation can take longer). If the deploy times out, run it again after the record resolves (`dig CNAME _<hash>.api.projectlimon.com`).
2. **Point the domain at the API.** After the deploy finishes, add:

   | Type | Name | Points to / Target | TTL |
   |---|---|---|---|
   | CNAME | `api` | the `ApiDomainDnsTarget` stack output (`d-xxxx.execute-api.us-east-1.amazonaws.com`) | default |

   Delete any existing `A` or `CNAME` record named `api` first; a name can only have one CNAME.

   If the DNS ever moves to Route 53, set `apiDomain.route53` in `environments.ts` and steps 1–2 happen automatically.
3. **Bootstrap the database** (creates `limon_app`, runs migrations, seeds), using the compute stack outputs:
   ```bash
   aws ecs run-task --cluster limon-pre --launch-type FARGATE \
     --task-definition <MigrateTaskDefinitionArn> \
     --network-configuration "awsvpcConfiguration={subnets=[<TaskSubnetIds>],securityGroups=[<AppSecurityGroupId>],assignPublicIp=DISABLED}"
   ```
   Re-run after each deploy that adds migrations.
4. **FatSecret.** Whitelist the `NatPublicIps` output (network stack) in the FatSecret developer console. Then put the API keys into the `limon-pre/fatsecret` secret (`client_id`, `client_secret`; it's created empty, and the API runs without FatSecret until it's filled) and restart the task:
   ```bash
   aws ecs update-service --cluster limon-pre --service <ApiService name> --force-new-deployment
   ```
   With Premier, also set `FATSECRET_SCOPES`, `FATSECRET_REGION=MX` and `FATSECRET_LANGUAGE=es` in the task environment (`commonEnv` in `compute-stack.ts`).
5. **Check:** `curl https://api.projectlimon.com/health`.
6. **App builds:** `APP_TENANT=<slug> eas build --profile preproduction` for each pilot's app. The profile points at `https://api.projectlimon.com`; set `EXPO_PUBLIC_COGNITO_USER_POOL_ID` / `EXPO_PUBLIC_COGNITO_PATIENT_CLIENT_ID` from the auth stack outputs (EAS environment variables).

### Tearing it down

`npx cdk destroy --all -c env=preproduction` removes compute, network (including the NAT instance and its Elastic IP) and queues and leaves a final DB snapshot. Retained on purpose (delete manually once data has moved to production): the Cognito user pool (disable deletion protection first), the S3 bucket, the log groups, the DB snapshot and the secrets' scheduled deletion.

## Region
`us-east-1` for the MVP (open decision #6). `mx-central-1` is worth evaluating when the real production environment is built — confirm Bedrock model and Cognito feature availability there first. Region is one value per profile in `infrastructure/config/environments.ts`.

## Secrets & env strategy
- Local: `.env` (gitignored), from `.env.example`.
- AWS: non-secret config as ECS task env; secrets (DB passwords, Stripe keys) from Secrets Manager injected as ECS secrets. `DATABASE_URL` is assembled at container start (`apps/api/src/lib/bootstrap-database-url.ts`). Apps read only `process.env`, validated at boot by `@limon/config`.

## Remaining gaps
- CI deploys (today `cdk deploy` builds and pushes images from the developer's machine)
- CloudFront for public branding assets
- Consider RDS Proxy once task counts grow
- Scope Bedrock/SES IAM to specific ARNs; SES domain identity
- SNS alarm routing (alarms currently only show in the console)
