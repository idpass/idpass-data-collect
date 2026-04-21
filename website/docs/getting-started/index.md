---
id: index
title: Quick Start
sidebar_position: 1
---

Get a complete ID PASS DataCollect stack running locally in a few minutes using Docker Compose. This is the fastest way to see the full system — sync server, admin UI, web app, and mobile app — without installing PostgreSQL or running anything on the host other than Docker.

### Prerequisites

- **Docker** 24+ (or **Podman** 5+ with the `docker compose` alias) — used for the turnkey stack
- **Node.js 22+** and **pnpm 10+** — only if you plan to run packages on the host outside the container
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
   | PostgreSQL | localhost:5432 | `admin` / password from `.env` |

4. **Verify the backend**

   ```bash
   curl http://localhost:3000/health
   # → {"status":"ok","database":"connected","timestamp":"..."}
   ```

5. **Sign in to the admin UI** at http://localhost:5173 with the email and password from `docker/.env`. From there you can create an app configuration, upload entity forms, and trigger syncs.

6. **(Optional) Seed demo data**

   ```bash
   pnpm install
   pnpm seed
   ```

   Creates a "Demo Household Registry" tenant with 4 households, 9 individuals, and a field-worker user.

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
