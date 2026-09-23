# ADR-005: AWS infrastructure

**Status:** Accepted · 2026-09-17

## Context
Primary cloud is AWS. Need private data tier, managed auth, queues, AI, and repeatable per-environment infrastructure.

## Decision
AWS CDK (TypeScript) with stacks: network, database, storage, auth, queues, compute, monitoring. ECS Fargate for api/dashboard/worker (shared, never per tenant); Aurora PostgreSQL Serverless v2 in isolated subnets; Cognito; private S3 with tenant prefixes and presigned URLs; SQS + DLQs; Bedrock via the API only; SES; Secrets Manager; CloudWatch; ALB + WAF, CloudFront in front. Separate development/staging/production (ideally separate accounts). Production synth disabled until deliberately enabled.

## Alternatives considered
- Terraform — no existing requirement; CDK keeps the monorepo single-language.
- EKS — operational overhead with no need.
- Lambda-only API — cold starts and connection management with Postgres; possible later for specific jobs.

## Consequences
+ Infra typed and reviewed like app code; environments are configuration.
− CDK lock-in to CloudFormation limits (stack size, deploy speed).
− Skeleton gaps (ECR, TLS, CloudFront, DB bootstrap) must be closed before first deployment — listed in aws.md.
