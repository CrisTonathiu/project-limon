# Built from repo root: docker build -f apps/api/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
# Without this, Prisma can't detect the OpenSSL version at `generate` time, silently guesses
# wrong (openssl-1.1.x), and bundles/selects the wrong query engine binary at runtime.
RUN apk add --no-cache openssl
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@limon/api...
# --legacy: pnpm v10 otherwise requires inject-workspace-packages=true to deploy workspace deps.
RUN pnpm deploy --filter=@limon/api --prod --legacy /out

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Same detection happens again at container start, not just at `generate` time.
RUN apk add --no-cache openssl
COPY --from=build /out .
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
