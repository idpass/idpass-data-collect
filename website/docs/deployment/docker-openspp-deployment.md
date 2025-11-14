---
id: docker-openspp-deployment
title: Deployment with Docker (OpenSPP Adapter)
sidebar_position: 3
---

# Deployment with Docker (OpenSPP Adapter)

This guide will walk you through deploying the ID PASS DataCollect application using Docker with the OpenSPP adapter.

## Prerequisites

Before you begin, ensure you have the following installed:

*   [Docker](https://docs.docker.com/get-docker/)
*   [Docker Compose](https://docs.docker.com/compose/install/)

## Step 1: Clone the Repository

First, clone the ID PASS DataCollect repository to your local machine:

```bash
git clone https://github.com/idpass/idpass-data-collect.git
cd idpass-data-collect
```

## Step 2: Configure Environment Variables

Navigate to the `docker` directory and copy the example environment files:

```bash
cd docker
```

```bash
cp .env.example .env
```

```bash
cp .env.example .env
```

```bash
cp adapters/openspp/openspp.env.example adapters/openspp/openspp.env
```

Edit these `.env` files to configure your database and OpenSPP adapter settings. For example, you might want to change the PostgreSQL password or other sensitive information.

_Screenshot Placeholder: A screenshot showing the `docker` directory with `postgresql.env` and `openspp.env` files created/edited._

## Step 3: Build and Run Docker Containers

From the `docker` directory, run Docker Compose to build and start the services, specifically including the OpenSPP adapter:

**For Development:**
```bash
docker compose -f docker-compose.dev.yaml -f adapters/openspp/docker-compose.openspp.yaml up --build -d
```

**For Production:**
```bash
docker compose -f docker-compose.yaml -f adapters/openspp/docker-compose.openspp.yaml up --build -d
```

**For Portainer Management:**
```bash
docker compose -f docker-compose.portainer.yaml -f adapters/openspp/docker-compose.openspp.yaml up --build -d
```

This command will:

*   `--build`: Build the Docker images (if not already built).
*   `-d`: Run the containers in detached mode (in the background).
*   `-f docker-compose.dev.yaml`: Use the development Docker Compose file (includes hot-reload and development tools).
*   `-f docker-compose.yaml`: Use the production Docker Compose file (optimized for production).
*   `-f docker-compose.portainer.yaml`: Use Portainer-optimized Docker Compose file (for Portainer management).
*   `-f adapters/openspp/docker-compose.openspp.yaml`: Include the OpenSPP adapter services.

_Screenshot Placeholder: A screenshot of the terminal output after running the `docker-compose up` command, showing containers starting successfully._

## Step 4: Verify Deployment

After the containers are up and running, you can verify their status:

**For Development:**
```bash
docker compose -f docker-compose.dev.yaml -f adapters/openspp/docker-compose.openspp.yaml ps
```

**For Production:**
```bash
docker compose -f docker-compose.yaml -f adapters/openspp/docker-compose.openspp.yaml ps
```

You should see a list of running services including:
- Backend server
- Admin UI
- PostgreSQL database
- OpenSPP/Odoo instance (if included in the compose file)

The application should be accessible at `http://localhost:8080` (or your configured port).

_Screenshot Placeholder: A screenshot of the `docker-compose ps` output, showing all services in a 'running' state. Another screenshot showing the application's login page in a web browser._

## Step 5: Stop and Remove Containers

To stop and remove the running Docker containers and networks, use:

**For Development:**
```bash
docker compose -f docker-compose.dev.yaml -f adapters/openspp/docker-compose.openspp.yaml down
```

**For Production:**
```bash
docker compose -f docker-compose.yaml -f adapters/openspp/docker-compose.openspp.yaml down
```

To remove all volumes associated with the containers (useful for a clean slate):

```bash
docker compose -f docker-compose.dev.yaml -f adapters/openspp/docker-compose.openspp.yaml down --volumes
```

## Docker Compose Files

The project includes several Docker Compose files for different deployment scenarios:

- **`docker-compose.dev.yaml`**: Development setup with hot-reload and development tools
- **`docker-compose.yaml`**: Production setup optimized for performance
- **`docker-compose.portainer.yaml`**: Portainer-optimized setup for container management
- **`adapters/openspp/docker-compose.openspp.yaml`**: OpenSPP adapter services

## Docker Images

The project uses separate Dockerfiles for different components:

- **`Dockerfile`**: Main application Dockerfile
- **`Dockerfile.backend`**: Backend server-specific Dockerfile
- **`Dockerfile.admin-ui`**: Admin UI-specific Dockerfile

These allow for optimized builds and deployment of individual components.
