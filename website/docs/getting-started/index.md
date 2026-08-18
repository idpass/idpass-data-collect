---
id: index
title: Quick Start
sidebar_position: 1
---

Get a complete ID PASS DataCollect stack running locally in a few minutes using Docker Compose. This is the fastest way to see the full system — sync server, admin UI, web app, and mobile app — without installing PostgreSQL or running anything on the host other than Docker.

### Prerequisites

- **Docker** 24+ (or **Podman** 5+ with the `docker compose` alias) — used for the turnkey stack
- **Node.js 22.12+** and **pnpm 10.14+** — only for step 6 and for running packages on the host outside the container. See [Installation](./installation.md#toolchain-only-for-running-packages-on-the-host) for how to install them.
- Modern web browser with [IndexedDB](../../glossary#indexeddb) support

### 5-Minute Setup (Docker Compose)

1. **Clone the repository**

   ```bash
   git clone https://github.com/idpass/idpass-data-collect.git
   cd idpass-data-collect
   ```

2. **Prepare the environment file**

   ```bash
   cp docker/.env.example docker/.env
   ```

   The defaults work out of the box for local development. `ADMIN_PASSWORD` in the example already meets the strength requirements (≥8 chars, mixed case, digit, special char) and `JWT_SECRET` is ≥32 characters — change both before any real deployment.

3. **Start the stack**

   ```bash
   docker compose -f docker/docker-compose.dev.yaml up -d
   ```

   First run builds the images and takes a few minutes. After that it brings up five services:

   | Service | URL | Notes |
   |---------|-----|-------|
   | Sync server (backend) | http://localhost:3000 | REST API; health at `/health` |
   | Admin UI | http://localhost:5173 | Sign in with `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env` |
   | Web app (self-service) | http://localhost:5174 | Citizen-facing portal |
   | Mobile app (browser preview) | http://localhost:8081 | Runs the mobile app in the browser for development |
   | PostgreSQL | localhost:5432 | Database, not a web page — see below |

   PostgreSQL speaks its own protocol, so `localhost:5432` in a browser returns nothing. To look inside the database, use a client with the `POSTGRES_USER` / `POSTGRES_PASSWORD` values from `docker/.env`. This works without installing anything locally:

   ```bash
   docker exec -it $(docker compose -f docker/docker-compose.dev.yaml ps -q postgres) \
     psql -U admin -d datacollect
   ```

   If only some containers came up, see [Only some containers started](./installation.md#only-some-containers-started).

4. **Verify the backend**

   ```bash
   curl http://localhost:3000/health
   # → {"status":"ok","database":"connected","timestamp":"..."}
   ```

5. **Sign in to the admin UI** at http://localhost:5173 with the email and password from `docker/.env`. From there you can create an app configuration, upload entity forms, and trigger syncs.

6. **(Optional) Seed demo data**

   This step runs on your host rather than in Docker, so it needs Node.js 22.12+, pnpm 10.14+, and `bash`, `curl`, and `python3` on `PATH`. On Windows, run it from Git Bash or WSL. See [Installation](./installation.md#toolchain-only-for-running-packages-on-the-host) if you need to install or upgrade any of them.

   ```bash
   pnpm install
   pnpm seed
   ```

   This creates two tenants — **Demo Household Registry** and **Demo Individual Registry** — with households, cooperatives, individuals and their linked activity records, three additional users (field worker, supervisor, enumerator), review configurations, a mix of pending/approved/rejected reviews, attachments, and some event history. The script prints exactly what it created, with the login for each user, when it finishes.

   Re-running it is safe: configurations are archived and re-uploaded in place, and existing users are left as they are (their passwords are not reset).

   If the mock registry server is running (`docker compose -f docker/docker-compose.dev.yaml --profile mock up -d`), the seed also provisions a `demo-mock-registry` tenant and populates the mock with 2 households + 5 persons so you can trigger external sync from the admin UI immediately. The tenant's stored URL is the in-network `http://mock-registry:9999`; from your host the same service is at `http://localhost:9999`.

### Stopping the stack

```bash
docker compose -f docker/docker-compose.dev.yaml down          # stop
docker compose -f docker/docker-compose.dev.yaml down -v       # stop and wipe the database
```

### Your First Application

Install the core library in your own project:

```bash
pnpm add @idpass/data-collect-core
```

:::note Registry configuration required
`@idpass/*` packages are published to GitHub Packages, not npmjs.org. Point the scope at that registry and authenticate first — see [Method 3 in the Installation Guide](./installation.md#method-3-package-installation-embedding-the-library).
:::

Create a minimal offline-first client:

```typescript
import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  IndexedDbAuthStorageAdapter,
  EventStoreImpl,
  EntityStoreImpl,
  EventApplierService,
  InternalSyncManager,
  AuthManager,
  SyncLevel,
} from "@idpass/data-collect-core";

async function initializeDataManager() {
  const eventStorage = new IndexedDbEventStorageAdapter("my-events");
  const entityStorage = new IndexedDbEntityStorageAdapter("my-entities");
  const authStorage = new IndexedDbAuthStorageAdapter("my-auth");

  const eventStore = new EventStoreImpl(eventStorage);
  const entityStore = new EntityStoreImpl(entityStorage);
  await eventStore.initialize();
  await entityStore.initialize();
  await authStorage.initialize();

  const eventApplier = new EventApplierService(eventStore, entityStore);

  const internalSync = new InternalSyncManager(
    eventStore,
    entityStore,
    eventApplier,
    "http://localhost:3000",
    authStorage,
  );

  const authManager = new AuthManager([], "http://localhost:3000", authStorage);

  return new EntityDataManager(
    eventStore,
    entityStore,
    eventApplier,
    null, // no external sync for this example
    internalSync,
    authManager,
  );
}

const manager = await initializeDataManager();

const group = await manager.submitForm({
  guid: "group-001",
  entityGuid: "group-001",
  type: "create-group",
  data: { name: "Smith Family" },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
});
console.log("Created group:", group);

const member = await manager.submitForm({
  guid: "member-001",
  entityGuid: "individual-001",
  type: "create-individual",
  data: { name: "John Smith", dateOfBirth: "1980-01-01", relationship: "Head" },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
});
console.log("Created member:", member);
```

### Running packages on the host

If you want to run individual packages directly (for example to attach a debugger to the backend), see the [Installation Guide](./installation.md) — it covers running each workspace package without Docker.

## What's Next?

- [Installation Guide](./installation.md) — alternative setups (host PostgreSQL, bare-metal Node.js)
- [Configuration](./configuration.md) — tenant configs, forms, auth, external sync
- [Architecture](../architecture/) — event sourcing, sync model, auth
- [API Reference](../../packages/datacollect/api/) — `@idpass/data-collect-core` complete API

## Need Help?

- Open an issue on [GitHub](https://github.com/idpass/idpass-data-collect/issues)
- Join the [Community Discussions](https://github.com/idpass/idpass-data-collect/discussions)
