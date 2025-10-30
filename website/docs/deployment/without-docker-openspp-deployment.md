---
id: without-docker-openspp-deployment
title: Deployment without Docker (OpenSPP Adapter)
sidebar_position: 4
---

# Deployment without Docker (OpenSPP Adapter)

This guide will walk you through deploying the ID PASS DataCollect application without Docker, using the OpenSPP adapter. This method requires you to manually set up and manage the environment and services.

## Prerequisites

Before you begin, ensure you have the following installed:

*   [Node.js](https://nodejs.org/en/download/) (LTS version recommended)
*   [PNPM](https://pnpm.io/installation) [[memory:6572312]]
*   [PostgreSQL](https://www.postgresql.org/download/)
*   Git

## Step 1: Clone the Repository

First, clone the ID PASS DataCollect repository to your local machine:

```bash
git clone https://github.com/idpass/idpass-data-collect.git
```

```bash
cd idpass-data-collect
```

## Step 2: Install Dependencies

Install the project dependencies using PNPM:

```bash
pnpm install
```

_Screenshot Placeholder: A screenshot of the terminal output after `pnpm install` completes successfully._

## Step 3: Set up PostgreSQL Database

1.  **Create a PostgreSQL User and Database:**

    Access your PostgreSQL server and create a dedicated user and database for the application. For example:

    ```bash
    sudo -u postgres psql
    ```

    ```sql
    CREATE USER idpassuser WITH PASSWORD 'idpasspassword';
    ```

    ```sql
    CREATE DATABASE idpassdb OWNER idpassuser;
    ```

    ```bash
    \q
    ```

    _Screenshot Placeholder: A screenshot showing the PostgreSQL commands being executed in the psql terminal._

2.  **Configure Database Connection:**

    Create a `.env` file in the `packages/backend` directory and configure the database connection string:

    ```bash
    cd packages/backend
    ```

    ```bash
    touch .env
    ```

    Edit the `.env` file and add the following (replace with your actual credentials):

    ```
    DATABASE_URL="postgresql://idpassuser:idpasspassword@localhost:5432/idpassdb"
    ```

    _Screenshot Placeholder: A screenshot showing the content of the `.env` file with the `DATABASE_URL`._

## Step 4: Build the Application

Build the backend and frontend applications. From the project root:

```bash
pnpm build
```

This command will compile all necessary packages.

_Screenshot Placeholder: A screenshot of the terminal output after `pnpm build` completes successfully, showing various packages being built._

## Step 5: Run the Backend Server

Navigate to the `packages/backend` directory and start the server:

```bash
cd packages/backend
```

```bash
pnpm start
```

_Screenshot Placeholder: A screenshot of the terminal output showing the backend server starting and listening on a port._

## Step 6: Run the Frontend (Admin Panel)

In a new terminal, navigate to the `packages/admin` directory and start the admin panel:

```bash
cd packages/admin
```

```bash
pnpm start
```

_Screenshot Placeholder: A screenshot of the terminal output showing the frontend development server starting._

## Step 7: Access the Application

Once both the backend and frontend are running, you can access the application:

*   **Backend API:** `http://localhost:3000` (or the port configured in `packages/backend/.env`)
*   **Admin Panel:** `http://localhost:5173` (or the port shown when running `pnpm start` in `packages/admin`)

_Screenshot Placeholder: A screenshot showing the application's login page in a web browser._
