# Built from repo root (Cloud Run runs amd64):
#   docker build --platform linux/amd64 -f packages/database/Dockerfile .
# Image of the one-off `migrate` Cloud Run Job (infrastructure/terraform/environments/preproduction/database.tf).
# Needs the prisma/tsx CLIs, which are devDependencies — unlike apps/api/Dockerfile this is
# not a `pnpm deploy --prod` image, since it's never a long-running service.
FROM node:22-alpine AS build
WORKDIR /repo
# Without this, Prisma can't detect the OpenSSL version and silently guesses wrong.
RUN apk add --no-cache openssl
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# bootstrap-role.ts imports @limon/config as a built package (dist/), not by source.
RUN pnpm turbo run build --filter=@limon/database...

WORKDIR /repo/packages/database
# `prisma migrate deploy` reads DATABASE_URL straight from the shell env (unlike our own
# scripts, which assemble it themselves) — the entrypoint exports DATABASE_URL (limon_app)
# and DATABASE_MIGRATION_URL (limon_owner) for real, then runs the command. Keeping that in
# the entrypoint lets a one-off run swap the command (Cloud Run `--args`), e.g. for the RLS
# tests: npx vitest run test/integration/tenant-isolation.test.ts
ENTRYPOINT ["sh", "-c", "eval \"$(node prisma/print-env.mjs)\" && exec \"$@\"", "migrate"]
# The schema only has one datasource url (DATABASE_URL), so migrate deploy needs it
# temporarily pointed at the owner role (limon_app has no schema DDL permissions by design),
# same as the local `migrate:dev` package.json script does.
CMD ["sh", "-c", "npx tsx prisma/bootstrap-role.ts && DATABASE_URL=\"$DATABASE_MIGRATION_URL\" npx prisma migrate deploy && npx tsx prisma/seed.ts"]
