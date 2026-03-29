---
id: docker-deployment
title: Deployment with Docker
sidebar_position: 2
---

# Deployment with Docker

ID PASS DataCollect v2.0 uses a consolidated **multi-stage Dockerfile** that builds all services in a single image. Frontend SPAs (admin, web) are served via **nginx**.

## Multi-Stage Build

The Dockerfile builds in stages:

1. **base** — installs pnpm on top of `node:22-bookworm-slim`
2. **build** — installs all dependencies and compiles TypeScript for all packages
3. **backend** — production Node.js image; copies build artifacts and starts `packages/backend/dist/index.js`
4. **admin-ui** — nginx image serving the compiled admin SPA from `packages/admin/dist`
5. **web-ui** — nginx image serving the compiled web app SPA from `packages/web/dist`

The frontend stages accept a `VITE_API_URL` build argument that is baked into the SPA at build time:

```bash
docker compose build --build-arg VITE_API_URL=https://api.example.com
```

```bash
# Build all images
docker compose build

# Or build individual services
docker compose build backend
docker compose build admin
docker compose build web
```

## Docker Compose

The project includes Compose configurations compatible with **Coolify** and standard Docker Compose:

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f backend
```

### Environment Variables

Set these in your `.env` or Compose environment:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `JWT_SECRET` | Yes | — | ≥32 characters; the server will not start without it |
| `CORS_ORIGINS` | Yes | `*` | Comma-separated allowed origins |
| `POSTGRES` | Yes | — | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db`) |
| `ADMIN_EMAIL` | No | `admin@datacollect.lan` | Initial admin user email |
| `ADMIN_PASSWORD` | No | `admin` | Initial admin user password |
| `PUBLIC_BASE_URL` | No | `` | Public URL of the backend, used in OTP emails and OIDC redirects |
| `EXTERNAL_SYNC_ENABLED` | No | `false` | Enable the external sync scheduler |
| `NODE_ENV` | No | `production` | Set to `development` to expose OTP codes in API responses |

The Compose file also exposes the following port mappings by default:

| Service | Host port | Container port |
|---------|-----------|----------------|
| `sync-server` | `3000` | `3000` |
| `admin-ui` | `4173` | `80` |
| `web-ui` | `5174` | `80` |

Override the host ports with `SYNC_SERVER_PORT`, `ADMIN_API_URL`, and `WEB_API_URL` environment variables.

## Non-Root Containers

All containers run as non-root users for security. If you encounter permission issues with mounted volumes, ensure the host directories are writable by the container user.

## Podman Compatibility

The project auto-detects Podman vs Docker at runtime. The `pr-check` and test scripts use `resolve_compose_cmd()` to select the correct compose command.

## Adapter-Specific Guides

*   [Generic Adapter Deployment](./docker-generic-deployment.md)
*   [OpenFN Adapter Deployment](./docker-openfn-deployment.md)
*   [OpenSPP Adapter Deployment](./docker-openspp-deployment.md)
