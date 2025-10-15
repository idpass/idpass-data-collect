---
id: docker-openfn-deployment
title: Deployment with Docker (OpenFN Adapter)
sidebar_position: 2
---

# Deployment with Docker (OpenFN Adapter)

This guide will walk you through deploying the ID PASS DataCollect application using Docker with the OpenFN adapter.

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

Navigate to the `docker` directory and copy the example environment file for PostgreSQL:

```bash
cd docker
```

```bash
cp .env.example .env
```

```bash
cp .env.example .env
```

Edit `postgresql.env` to configure your database settings. For example, you might want to change the PostgreSQL password or other sensitive information.

_Screenshot Placeholder: A screenshot showing the `docker` directory with `postgresql.env` file created/edited._

## Step 3: Build and Run Docker Containers

From the `docker` directory, run Docker Compose to build and start the services, specifically including the OpenFN adapter:

```bash
docker compose -f docker-compose.dev.yaml -f adapters/openfn/docker-compose.openfn.yaml up --build -d
```

This command will:

*   `--build`: Build the Docker images (if not already built).
*   `-d`: Run the containers in detached mode (in the background).
*   `-f docker-compose.dev.yaml`: Use the development Docker Compose file.
*   `-f adapters/openfn/docker-compose.openfn.yaml`: Include the OpenFN adapter services.

_Screenshot Placeholder: A screenshot of the terminal output after running the `docker-compose up` command, showing containers starting successfully._

## Step 4: Verify Deployment

After the containers are up and running, you can verify their status:

```bash
docker compose -f docker-compose.dev.yaml -f adapters/openfn/docker-compose.openfn.yaml ps
```

You should see a list of running services. The application should be accessible at `http://localhost:8080` (or your configured port).

_Screenshot Placeholder: A screenshot of the `docker-compose ps` output, showing all services in a 'running' state. Another screenshot showing the application's login page in a web browser._

## Step 5: Stop and Remove Containers

To stop and remove the running Docker containers and networks, use:

```bash
docker compose -f docker-compose.dev.yaml -f adapters/openfn/docker-compose.openfn.yaml down
```

To remove all volumes associated with the containers (useful for a clean slate):

```bash
docker compose -f docker-compose.dev.yaml -f adapters/openfn/docker-compose.openfn.yaml down --volumes
```
