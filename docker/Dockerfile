FROM node:22-bookworm-slim AS base
RUN npm i -g pnpm

FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build:datacollect

FROM base as backend
WORKDIR /app
COPY --from=build /app .
EXPOSE 3000 9229
CMD ["pnpm", "run", "dev:backend"]

FROM base as admin-ui
WORKDIR /app
COPY --from=build /app .
EXPOSE 5173
CMD ["pnpm", "run", "dev:admin"]

FROM base as mobile-app
WORKDIR /app
COPY --from=build /app .
EXPOSE 8081
CMD ["pnpm", "run", "dev:mobile"]