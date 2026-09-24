# Built from repo root: docker build -f packages/database/Dockerfile .
# One-off migrate/bootstrap task image (see infrastructure/stacks/compute/compute-stack.ts).
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
# scripts, which assemble it themselves) — export it for real before running that step.
# The schema only has one datasource url (DATABASE_URL), so migrate deploy needs it
# temporarily pointed at the owner role (limon_app has no schema DDL permissions by design),
# same as the local `migrate:dev` package.json script does.
CMD ["sh", "-c", "eval \"$(node prisma/print-env.mjs)\" && npx tsx prisma/bootstrap-role.ts && DATABASE_URL=\"$DATABASE_MIGRATION_URL\" npx prisma migrate deploy && npx tsx prisma/seed.ts"]
