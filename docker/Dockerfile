FROM node:22-bookworm-slim AS base
RUN npm i -g pnpm

FROM base AS build
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build:datacollect
RUN pnpm --filter @idpass/adapter-openspp --filter @idpass/adapter-openfn --filter @idpass/adapter-mock build
RUN pnpm run build:backend

FROM base AS backend
WORKDIR /app
COPY --from=build /app .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
CMD ["node", "packages/backend/dist/index.js"]

FROM build AS admin-build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm run build:admin

FROM nginx:alpine AS admin-ui
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=admin-build /app/packages/admin/dist /usr/share/nginx/html
EXPOSE 80

FROM build AS web-build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN pnpm run build:web

FROM nginx:alpine AS web-ui
COPY docker/nginx-spa.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80
