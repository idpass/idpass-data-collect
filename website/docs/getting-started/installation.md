---
id: installation
title: Installation Guide
sidebar_position: 2
---

This guide covers three ways to set up ID PASS DataCollect: the all-Docker stack, running packages on the host, and embedding the core library in your own app.

If you just want a running instance as quickly as possible, follow the [Quick Start](./index.md) and come back here only when you need something it doesn't cover.

## System Requirements

### Client Applications
- **Node.js**: 22.x or higher
- **Browser**: Modern browser with IndexedDB support (Chrome 58+, Firefox 55+, Safari 10+)
- **Memory**: Minimum 512 MB available for IndexedDB storage

### Backend Server
- **Node.js**: 22.x or higher
- **PostgreSQL**: 15.x or higher
- **Memory**: Minimum 2 GB RAM for production
- **Storage**: SSD recommended for database performance

### Secrets

- `ADMIN_PASSWORD` must be at least 8 characters and include an uppercase letter, lowercase letter, digit, and special character. The backend refuses to start otherwise.
- `JWT_SECRET` must be at least 32 characters long. The backend refuses to start otherwise.

## Method 1: Docker Deployment (recommended)

For a production-like local environment.

### 1. Clone the repository

```bash
git clone https://github.com/idpass/idpass-data-collect.git
cd idpass-data-collect
```

### 2. Configure the environment

```bash
cp docker/.env.example docker/.env
# Edit docker/.env if you want to change admin credentials, JWT secret, or CORS origins.
```

The example file is pre-configured with values that pass validation. **Change `ADMIN_PASSWORD`, `JWT_SECRET`, and `POSTGRES_PASSWORD` before any non-local deployment.**

### 3. Start the stack

```bash
docker compose -f docker/docker-compose.dev.yaml up -d
```

Services available after startup:

| Service | Host URL | Container port |
|---------|----------|----------------|
| Sync server | http://localhost:3000 | 3000 |
| Admin UI | http://localhost:5173 | 5173 |
| Web app | http://localhost:5174 | 5174 |
| Mobile app (browser) | http://localhost:8081 | 8081 |
| PostgreSQL | localhost:5432 | 5432 |
| Node debugger | localhost:9229 | 9229 |

### 4. Verify

```bash
curl http://localhost:3000/health
# → {"status":"ok","database":"connected","timestamp":"..."}
```

Sign in at http://localhost:5173 with the email and password from `docker/.env`.

### 5. Stop

```bash
docker compose -f docker/docker-compose.dev.yaml down        # keeps the database volume
docker compose -f docker/docker-compose.dev.yaml down -v     # wipes the database volume
```

## Method 2: Host Development

Run each package directly on the host. Useful for attaching a debugger, iterating quickly without rebuilding images, or targeting an existing PostgreSQL instance.

### 1. Clone and install

```bash
git clone https://github.com/idpass/idpass-data-collect.git
cd idpass-data-collect
pnpm install
pnpm --filter @idpass/data-collect-core build
```

Verify the core library:

```bash
pnpm --filter @idpass/data-collect-core test
```

### 2. Start PostgreSQL

The fastest way is Docker:

```bash
docker run --name postgres-datacollect \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD='Correct horse battery staple 42!' \
  -e POSTGRES_DB=datacollect \
  -p 5432:5432 \
  -d postgres:15
```

Or install PostgreSQL 15+ locally and create a `datacollect` database owned by `admin`.

### 3. Configure and run the backend

The backend reads its environment file from `docker/.env`:

```bash
cp docker/.env.example docker/.env
# Optional: change POSTGRES_HOST=postgres to POSTGRES_HOST=localhost if running PostgreSQL on the host
pnpm --filter @idpass/data-collect-backend dev
# → Sync server is running on http://localhost:3000
```

### 4. Run the admin UI

```bash
cp packages/admin/.env.example packages/admin/.env   # if the example exists; otherwise skip
pnpm --filter @idpass/data-collect-admin dev
# → http://localhost:5173
```

Set `VITE_API_URL=http://localhost:3000` if you need to point the admin UI at a non-default backend.

### 5. Run the web app

```bash
pnpm --filter @idpass/data-collect-web dev
# → http://localhost:5174
```

### 6. Run the mobile app (browser preview)

```bash
pnpm --filter @idpass/data-collect-mobile dev
# → http://localhost:8081
```

For native builds see the mobile package README (`pnpm build:ios`, `pnpm build:android`, etc.).

## Method 3: Package installation (embedding the library)

Use this when you want offline-first storage in your own app and don't need the sync server.

### 1. Install

```bash
pnpm add @idpass/data-collect-core
```

### 2. Basic usage

```typescript
import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  IndexedDbAuthStorageAdapter,
  EventStoreImpl,
  EntityStoreImpl,
  EventApplierService,
  AuthManager,
  InternalSyncManager,
  SyncLevel,
} from "@idpass/data-collect-core";

const eventStorage = new IndexedDbEventStorageAdapter();
const entityStorage = new IndexedDbEntityStorageAdapter();
const authStorage = new IndexedDbAuthStorageAdapter();

const eventStore = new EventStoreImpl(eventStorage);
await eventStore.initialize();

const entityStore = new EntityStoreImpl(entityStorage);
await entityStore.initialize();

await authStorage.initialize();

const eventApplier = new EventApplierService(eventStore, entityStore);

const authConfigs = [
  { type: "auth0", fields: { domain: "your-domain.auth0.com", clientId: "your-client-id" } },
  { type: "keycloak", fields: { realm: "your-realm", clientId: "your-client-id" } },
];

const authManager = new AuthManager(authConfigs, "http://localhost:3000", authStorage);
await authManager.initialize();

const internalSync = new InternalSyncManager(
  eventStore,
  entityStore,
  eventApplier,
  "http://localhost:3000",
  authStorage,
);

const manager = new EntityDataManager(
  eventStore,
  entityStore,
  eventApplier,
  null, // no external sync adapter for offline-only usage
  internalSync,
  authManager,
);
```

## Verification

### Test the core library with authentication

```typescript
await manager.initializeAuthManager();

await manager.login({ username: "admin@datacollect.lan", password: "Correct horse battery staple 42!" });

const result = await manager.submitForm({
  guid: "test-group-001",
  type: "create-group",
  entityGuid: "test-group-001",
  data: { name: "Test Family" },
  timestamp: new Date().toISOString(),
  userId: "test-user",
  syncLevel: SyncLevel.LOCAL,
});

const saved = await manager.getEntity(result.id);
await manager.syncWithSyncServer();
```

### Test the backend API

You can exercise every endpoint from the Postman collection: [IDPASS DataCollect Backend Postman Collection](/api/idpass-backend.postman_collection.json).

```bash
# Health
curl http://localhost:3000/health

# Login
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@datacollect.lan", "password": "Correct horse battery staple 42!"}'
```

### Test the admin interface

1. Open http://localhost:5173
2. Log in with the email and password from `docker/.env`
3. Navigate to the **Users** section and verify the management UI loads

## Common Installation Issues

### Backend crashes with `ADMIN_PASSWORD does not meet strength requirements`
Ensure the password in `docker/.env` has an uppercase letter, a lowercase letter, a digit, and a special character, and is at least 8 characters long.

### Backend crashes with `JWT_SECRET must be at least 32 characters long`
Pick a longer secret. In production, use a cryptographically random value (e.g. `openssl rand -base64 48`).

### PostgreSQL connection errors
1. Verify PostgreSQL is running (`docker ps` or `systemctl status postgresql`)
2. Check `POSTGRES_HOST` — inside Docker the hostname is `postgres`, on the host it's `localhost`
3. Confirm the password in `docker/.env` matches what PostgreSQL was initialized with; if you changed it, you may need `docker compose down -v` to wipe the existing volume

### IndexedDB errors in tests
```typescript
// Use fake-indexeddb in Node-side tests
import "fake-indexeddb/auto";
```

### Port conflicts
Defaults: 3000 (backend), 5173 (admin), 5174 (web), 8081 (mobile), 5432 (postgres). Override the host port mappings via `SYNC_SERVER_PORT`, or by editing the compose file.

### Build failures
1. Ensure Node.js version 22+: `node --version`
2. Clear and reinstall: `rm -rf node_modules && pnpm install`
3. Check for peer dependency conflicts: `pnpm ls`

## Production Considerations

### Security
- Strong, unique `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`, and `JWT_SECRET` (≥32 chars)
- Configure an identity provider (Auth0, Keycloak) for end users — avoid shared backend accounts
- Serve everything over HTTPS and restrict `CORS_ORIGINS` to known front-ends
- Regularly update dependencies

### Performance
- Use SSD storage for PostgreSQL
- Tune PostgreSQL memory settings for your workload
- Enable gzip compression in the reverse proxy
- Monitor IndexedDB quota usage on the client

### Monitoring
- Collect Express/pino logs from the backend
- Monitor PostgreSQL performance and replication lag if applicable
- Track API response times
- Wire health checks to `/health` for the orchestrator

## Next Steps

- [Configuration Guide](./configuration.md) — tenants, forms, auth, external sync
- [API Documentation](../../packages/datacollect/api/) — core library API
- [Deployment Guide](../deployment/) — production deployment (Docker and bare-metal)
