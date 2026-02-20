FROM node:22-bookworm-slim AS base
RUN npm i -g pnpm

FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build:datacollect
RUN pnpm run build:backend

FROM base AS backend
WORKDIR /app
COPY --from=build /app .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["pnpm", "run", "dev:backend"]

FROM base AS admin-ui
WORKDIR /app
COPY --from=build /app .
EXPOSE 5173
CMD ["pnpm", "run", "dev:admin"]

FROM base AS mobile-app
WORKDIR /app
COPY --from=build /app .
EXPOSE 8081
CMD ["pnpm", "run", "dev:mobile"]
