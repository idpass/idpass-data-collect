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
# Own the app tree as the unprivileged built-in node user so the server can
# write generated public artifacts at runtime while running as non-root.
COPY --from=build --chown=node:node /app .
# `WORKDIR /app` is created root-owned and `COPY --chown` only chowns the copied
# *contents*, not the /app directory itself — so the non-root `node` user cannot
# create new entries at the /app root. multer 2 eagerly `mkdir`s its upload
# destination (`/app/uploads`) when routes are constructed at startup, which
# would throw EACCES and crash-loop the server. Give `node` ownership of the
# workdir and pre-create the uploads directory.
RUN mkdir -p /app/uploads && chown node:node /app /app/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"
USER node
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
