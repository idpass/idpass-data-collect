---
id: docker-generic-deployment
title: Deployment with Docker (Generic Adapter)
sidebar_position: 1
---

# Deployment with Docker (Generic/Mocked Adapter)

This guide will walk you through deploying the ID PASS DataCollect application using Docker with a generic or mocked adapter for development purposes. This is useful when you want to run the application without a specific backend adapter.

## Prerequisites

Before you begin, ensure you have the following installed:

*   [Docker](https://docs.docker.com/get-docker/)
*   [Docker Compose](https://docs.docker.com/compose/install/)

## Step 1: Clone the Repository

First, clone the ID PASS DataCollect repository to your local machine:

```bash
git clone https://github.com/idpass/idpass-data-collect.git
```

```bash
cd idpass-data-collect
```

## Step 2: Configure Environment Variables

Copy the example environment file into place:

```bash
cp docker/.env.example docker/.env
```

Edit `docker/.env` to change the default admin credentials, JWT secret, and CORS origins. The defaults are sufficient to boot the stack locally but **must** be changed before any non-local deployment.

Key requirements:
- `ADMIN_PASSWORD` must be ≥8 characters and include uppercase, lowercase, digit, and special character
- `JWT_SECRET` must be ≥32 characters

## Step 3: Build and Run Docker Containers

From the repository root, bring up the development compose stack:

```bash
docker compose -f docker/docker-compose.dev.yaml up --build -d
```

This command will:

*   `--build`: Build the Docker images (if not already built).
*   `-d`: Run the containers in detached mode (in the background).

## Step 4: Verify Deployment

After the containers are up and running, you can verify their status:

```bash
docker compose -f docker/docker-compose.dev.yaml ps
```

Expected services and host URLs:

| Service | URL |
|---------|-----|
| Sync server | http://localhost:3000 (health at `/health`) |
| Admin UI | http://localhost:5173 |
| Web app | http://localhost:5174 |
| Mobile app (browser) | http://localhost:8081 |
| PostgreSQL | localhost:5432 |

## Step 5: Stop and Remove Containers

To stop the stack:

```bash
docker compose -f docker/docker-compose.dev.yaml down
```

To remove the PostgreSQL volume as well (clean slate):

```bash
docker compose -f docker/docker-compose.dev.yaml down --volumes
```
