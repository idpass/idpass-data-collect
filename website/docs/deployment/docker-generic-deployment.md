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

Navigate to the `docker` directory and copy the example environment file:

```bash
cd docker
```

```bash
cp .env.example .env
```

```bash
cp .env.example .env
```

You may edit the `.env` and `postgresql.env` files to configure your database settings and any other environment variables.

## Step 3: Build and Run Docker Containers

From the `docker` directory, run Docker Compose to build and start the services using the development compose file:

```bash
docker compose -f docker-compose.dev.yaml up --build -d
```

This command will:

*   `--build`: Build the Docker images (if not already built).
*   `-d`: Run the containers in detached mode (in the background).
*   `-f docker-compose.dev.yaml`: Use the development Docker Compose file.

## Step 4: Verify Deployment

After the containers are up and running, you can verify their status:

```bash
docker compose -f docker-compose.dev.yaml ps
```

You should see a list of running services. The application should be accessible at `http://localhost:8080` (or your configured port).

## Step 5: Stop and Remove Containers

To stop and remove the running Docker containers and networks, use:

```bash
docker compose -f docker-compose.dev.yaml down
```

To remove all volumes associated with the containers (useful for a clean slate):

```bash
docker compose -f docker-compose.dev.yaml down --volumes
```
