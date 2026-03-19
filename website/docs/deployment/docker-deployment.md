---
id: docker-deployment
title: Deployment with Docker
sidebar_position: 2
---

# Deployment with Docker

ID PASS DataCollect v2.0 uses a consolidated **multi-stage Dockerfile** that builds all services in a single image. Frontend SPAs (admin, web) are served via **nginx**.

## Multi-Stage Build

The Dockerfile builds in stages:

1. **Base** — installs pnpm and dependencies
2. **Build** — compiles TypeScript for all packages
3. **Backend** — production Node.js image with only backend artifacts
4. **Admin** — nginx image serving the admin SPA
5. **Web** — nginx image serving the web app SPA

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

### Required Environment Variables

Set these in your `.env` or Compose environment:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | ≥32 characters (server won't start otherwise) |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `DATABASE_URL` | PostgreSQL connection string |

## Non-Root Containers

All containers run as non-root users for security. If you encounter permission issues with mounted volumes, ensure the host directories are writable by the container user.

## Podman Compatibility

The project auto-detects Podman vs Docker at runtime. The `pr-check` and test scripts use `resolve_compose_cmd()` to select the correct compose command.

## Adapter-Specific Guides

*   [Generic Adapter Deployment](./docker-generic-deployment.md)
*   [OpenFN Adapter Deployment](./docker-openfn-deployment.md)
*   [OpenSPP Adapter Deployment](./docker-openspp-deployment.md)
