---
id: migration-v2
title: Migrating to v2.0
sidebar_position: 5
---

# Migrating from v1.x to v2.0

This guide covers the breaking changes in v2.0.0-beta.1 and how to update your code.

## Adapter Imports

Sync adapters have been extracted into standalone packages. Update your imports:

```diff
- import { OpenSppSyncAdapter } from '@idpass/data-collect-core';
+ import { OpenSppOdooSyncAdapter } from '@idpass/adapter-openspp';

- import { OpenFnSyncAdapter } from '@idpass/data-collect-core';
+ import { OpenFnSyncAdapter } from '@idpass/adapter-openfn';
```

Install the new packages:

```bash
pnpm add @idpass/adapter-openspp
# or
pnpm add @idpass/adapter-openfn
```

### Adapter Registration

Adapters must now be registered via the `AdapterRegistry` at startup:

```typescript
import { AdapterRegistry } from '@idpass/data-collect-core';
import { OpenSppV2Adapter } from '@idpass/adapter-openspp';

// Register before use
AdapterRegistry.register('openspp', OpenSppV2Adapter);
```

## EntityPair.initial is Nullable

`EntityDataManager.getEntity()` now returns an `EntityPair` with a `guid` field and a nullable `initial` property. Entities that have not yet been synced will have `initial: null`.

### Before

```typescript
const entity = await dataManager.getEntity(guid);
const original = entity.initial.data; // always safe
```

### After

```typescript
const entityPair = await dataManager.getEntity(guid);
// initial is null for unsynced entities
const original = entityPair.initial?.data ?? null;
```

Audit all code that accesses `entityPair.initial` and add null checks.

## JWT Secret Requirements

The backend now requires `JWT_SECRET` to be at least 32 characters. The server will refuse to start if this requirement is not met.

```bash
# .env
JWT_SECRET=your-secret-key-that-is-at-least-32-characters-long
```

## CORS Configuration

`CORS_ORIGINS` now defaults to deny-all. You must explicitly set allowed origins:

```bash
# .env
CORS_ORIGINS=https://admin.example.com,https://web.example.com
```

For local development:

```bash
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:8081
```

## JWT Token Expiry

JWT tokens now expire after 1 hour (previously no expiry). Clients must handle token refresh:

- The backend provides a token refresh endpoint
- Mobile and web apps handle this automatically via their auth state machines
- Custom integrations must implement refresh logic

## Database Migrations

New tables are required. Run migrations before starting the server:

- `users`, `areas`, `userAssignments`
- `entityOverrides`, `entitySnapshots`
- `attachments`, `attachmentData`
- `otp_codes`, `submission_reviews`, `review_configs`
- `verifications`

## Checklist

- [ ] Update adapter imports to new packages
- [ ] Register adapters via `AdapterRegistry`
- [ ] Add null checks for `EntityPair.initial`
- [ ] Set `JWT_SECRET` (≥32 characters)
- [ ] Set `CORS_ORIGINS` explicitly
- [ ] Run database migrations
- [ ] Handle JWT token refresh in custom clients
