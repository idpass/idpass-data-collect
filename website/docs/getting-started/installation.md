---
id: installation
title: Installation Guide
sidebar_position: 2
---

This guide covers three ways to set up ID PASS DataCollect: the all-Docker stack, running packages on the host, and embedding the core library in your own app.

If you just want a running instance as quickly as possible, follow the [Quick Start](./index.md) and come back here only when you need something it doesn't cover.

## System Requirements

### Client Applications
- **Node.js**: 22.12.0 or higher (the workspace declares `node >=22.12.0`)
- **Browser**: Modern browser with IndexedDB support (Chrome 58+, Firefox 55+, Safari 10+)
- **Memory**: Minimum 512 MB available for IndexedDB storage

### Backend Server
- **Node.js**: 22.12.0 or higher
- **PostgreSQL**: 15.x or higher
- **Memory**: Minimum 2 GB RAM for production
- **Storage**: SSD recommended for database performance

### Toolchain (only for running packages on the host)

- **Node.js** ≥ 22.12.0. Recent pnpm releases refuse to start on older versions, so an outdated global Node fails immediately rather than subtly. Check with `node --version`, and upgrade with [nvm](https://github.com/nvm-sh/nvm), [nvm-windows](https://github.com/coreybutler/nvm-windows), [fnm](https://github.com/Schniz/fnm), or [Volta](https://volta.sh/) if needed.
- **pnpm** 10.14.x, the version pinned in `packageManager`. Install with `corepack enable && corepack use pnpm@10.14.0`, or `npm install -g pnpm@10` if you don't use Corepack.
- **`bash`, `curl`, and `python3`** on `PATH` — required by `pnpm seed`. On Windows, run seeding from Git Bash or WSL, not PowerShell.

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

The last two rows are not web pages. To inspect the database, use a client rather than a browser — `docker exec -it $(docker compose -f docker/docker-compose.dev.yaml ps -q postgres) psql -U admin -d datacollect` needs nothing installed locally.

:::tip If only some containers come up
`sync-server` waits for PostgreSQL to pass its healthcheck. If PostgreSQL is slow on a first run with a fresh volume, `sync-server` can be left in `Created` while the UI containers start and fail against a missing API. Check with `docker compose -f docker/docker-compose.dev.yaml ps`; if PostgreSQL is healthy but `sync-server` never started, re-run `up -d`.
:::

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
pnpm --filter @idpass/adapter-openspp --filter @idpass/adapter-openfn --filter @idpass/adapter-mock build
```

:::caution The adapters must be built too
The backend imports the OpenSPP, OpenFn, and Mock adapters at startup, and each resolves to its `dist/` output. Building only the core library leaves the backend unable to start, with `Cannot find module '@idpass/adapter-openspp'`. `pnpm build` from the repo root builds everything if you would rather not name each package.
:::

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

Running on the host, the backend reads `packages/backend/.env` — **not** `docker/.env`:

```bash
cp packages/backend/.env.example packages/backend/.env
# Edit it if your PostgreSQL host, port, or credentials differ from the defaults.
pnpm --filter @idpass/data-collect-backend dev
# → Sync server is running on http://localhost:3000
```

:::info Why there are two env files
`docker/.env` is read by Docker Compose, which injects the values into the container's environment. On the host there is no Compose, so the backend falls back to `dotenv`, which loads `.env` from the process's working directory — `packages/backend/`.

Copying `docker/.env` to that path does not work either: it composes its connection strings from other variables (`postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@…`). Compose expands those; plain `dotenv` does not, so the backend receives the literal string and fails with `getaddrinfo ENOTFOUND $POSTGRES_HOST`. `packages/backend/.env.example` therefore ships fully literal values — percent-encode any special characters in the password.
:::

### 4. Run the admin UI

```bash
cp packages/admin/.env.example packages/admin/.env
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

The `@idpass/*` packages are published to **GitHub Packages**, not to npmjs.org, so a plain `pnpm add` cannot resolve them until you point the scope at the right registry and authenticate.

Add to your project's `.npmrc`:

```ini
@idpass:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then, with `GITHUB_TOKEN` set to a token carrying the `read:packages` scope:

```bash
pnpm add @idpass/data-collect-core
```

:::note
The same applies to `@idpass/data-collect-backend`, `@idpass/adapter-openspp`, `@idpass/adapter-openfn`, and `@idpass/adapter-mock`. If you would rather not depend on GitHub Packages, build the library from a checkout and depend on the tarball or a git reference instead.
:::

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

### Only some containers started

`sync-server` starts only once PostgreSQL reports healthy, and the UI containers start once `sync-server` exists. If PostgreSQL is slow to pass its healthcheck on a first run, you can end up with UI containers running against an API that never started. Inspect with `docker compose -f docker/docker-compose.dev.yaml ps` and `… logs postgres`, then re-run `up -d` once PostgreSQL is healthy.

### The browser shows `Failed to resolve import "<package>"` even though the build succeeded

A dependency can end up missing from a service's image if it failed to install completely during the build without failing the build itself. Rebuild that one service from scratch:

```bash
docker compose -f docker/docker-compose.dev.yaml build --no-cache admin-ui
docker compose -f docker/docker-compose.dev.yaml up -d --force-recreate admin-ui
```

### `pnpm seed` fails with `set: pipefail: invalid option name` (Windows)

The shell script was checked out with CRLF line endings — Git for Windows does this by default (`core.autocrlf=true`), and `bash` then reads the trailing carriage return as part of the command. The repository ships a `.gitattributes` that forces LF for shell scripts, so a fresh clone is correct. If your clone predates it, re-check-out just the scripts:

```bash
git checkout -- scripts/ .husky/
```

If other scripts are still affected, `git rm --cached -r . && git reset --hard` renormalizes the whole tree — but it discards uncommitted changes, so commit or stash first.

### `pnpm seed` fails before it starts

The seed script needs `bash`, `curl`, and `python3` on `PATH`, plus a running backend. On Windows use Git Bash or WSL — PowerShell cannot run it.

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
