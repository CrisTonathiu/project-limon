# AWS Architecture

```
Internet ─▶ CloudFront ─▶ WAF ─▶ ALB (public subnets)
                                  ├─ /api/*  ─▶ ECS api      (private subnets)
                                  └─ /*      ─▶ ECS dashboard(private subnets)
                         ECS worker ◀─ SQS (jobs, tenant-deletion) + DLQs
ECS tasks ─▶ Aurora PostgreSQL Serverless v2 (isolated subnets, not public)
          ─▶ S3 (VPC gateway endpoint) · Cognito · Bedrock · SES · Secrets Manager
Logs/metrics/alarms ─▶ CloudWatch
```

## Stacks (`infrastructure/`, CDK TypeScript)
| Stack | Resources |
|---|---|
| network | VPC (3 AZ), public/app/data subnets, S3 gateway endpoint, SGs (ALB → app → DB only) |
| database | Aurora PG 16 Serverless v2, encrypted, IAM auth, owner secret + app-user secret |
| storage | private tenant-assets bucket (BPA, SSE, TLS-only, versioned outside dev) |
| auth | Cognito user pool, dashboard + patient-apps clients |
| queues | jobs queue + tenant-deletion queue, each with DLQ, SSE |
| compute | ECS cluster; api, dashboard, worker Fargate services (ARM64); ALB; regional WAF (AWS managed rules + IP rate limit) |
| monitoring | ALB 5xx, API CPU, DLQ depth alarms |

**Shared services only** — no per-tenant ECS services, databases, or stacks.

## Environments
`infrastructure/config/environments.ts`: `development`, `staging`, `production` — separate everything; recommended separate AWS accounts. Production synth is disabled until explicitly enabled.

```bash
cd infrastructure
npx cdk synth -c env=development
npx cdk deploy --all -c env=development   # requires AWS credentials
```

## Region
`us-east-1` today. The product serves Mexico only, so `mx-central-1` is worth evaluating for latency and data-residency optics — confirm Bedrock model and Cognito feature availability there before moving. Region is one value in `infrastructure/config/environments.ts`.

## Secrets & env strategy
- Local: `.env` (gitignored), from `.env.example`.
- AWS: non-secret config as ECS task env; secrets (DB passwords, Stripe keys) from Secrets Manager injected as ECS secrets. Apps read only `process.env`, validated at boot by `@limon/config`.

## Skeleton gaps (intentional, before first real deploy)
- ECR repos + CI image push (services currently reference a placeholder image)
- ACM certificate, HTTPS listener, domain/Route 53, CloudFront distribution + CloudFront-scoped WAF; restrict ALB to CloudFront prefix list
- DB bootstrap task: create `limon_app` role with the generated secret, run `prisma migrate deploy`; container entrypoint to assemble `DATABASE_URL`
- Consider RDS Proxy once task counts grow
- Scope Bedrock/SES IAM to specific ARNs; SES domain identity
- SNS alarm routing
