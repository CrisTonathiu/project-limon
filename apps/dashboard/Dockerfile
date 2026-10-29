# Built from repo root: docker build -f apps/dashboard/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@limon/dashboard...

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# The standalone server binds to $HOSTNAME, which Docker sets to the container id.
ENV HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /repo/apps/dashboard/.next/standalone ./
COPY --from=build /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/dashboard/server.js"]
