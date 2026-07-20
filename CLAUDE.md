# DataCollect Development Guidelines

Offline-first data management system for beneficiary data. TypeScript monorepo (pnpm workspaces) with four packages: `datacollect` (core library), `backend` (Express sync server), `admin` (Vue.js UI), `mobile` (Capacitor app).

## Principles (read before making changes)

All principles are in a `principles/*` directory

## Quick Reference

### Commands

Package manager: PNPM. Refer to `package.json` scripts.

## Project Overview

ID PASS DataCollect is a TypeScript-based offline-first data management system for household and individual beneficiary data. The project consists of three main modules:

1. **DataCollect** (`packages/datacollect`) - Main client library for offline data management using IndexedDB
2. **Backend** (`packages/backend`) - Central sync server using Express.js and PostgreSQL
3. **Admin** (`packages/admin`) - Vue.js admin interface for the sync server

## Architecture

The system uses event sourcing and CQRS patterns with the following key concepts:

- **Events**: Commands that represent changes to entities (stored in EventStore)
- **Entities**: Current state of Groups and Individuals (stored in EntityStore)
- **FormSubmissions**: Input data that generates events
- **Sync**: Two-level sync system (Internal sync between clients/server, External sync with third-party systems)

## Testing

### Running All Tests Locally

Refer to test and PR checking scripts.

### Seed Data

Refer to the seed command in `package.json`

Requires the backend to be running (default `http://localhost:3000`). Creates a "Demo Household Registry" config with 4 households, 9 individuals, and a field worker user. Safe to run multiple times (deletes and recreates). Override defaults with env vars: `BACKEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

### Test Suites

Each module has its own test suite:
- DataCollect: Uses Jest with fake-indexeddb for IndexedDB testing
- Backend: Uses Jest with supertest for API testing (requires PostgreSQL)
- Admin: Uses Vitest for Vue component testing

### Sync Testing Requirements

Sync is the highest-risk area of DataCollect. Bugs in sync are invisible at the component level — they live in the seams between ExternalSyncManager, adapter wrappers, EventApplierService, EntityStore, /pull endpoint, and the mobile syncMachine. Component-level mocks hide these integration failures.

**When changing sync code:**

1. **Trace the full data path, not just the file you're editing.** A record flows: external API → adapter transform → EventApplierService.submitForm → EntityStore.saveEntity → /pull endpoint → syncMachine.pullFromRemote → mobile EventApplierService. Any change to one step must be verified against its consumers and producers.

2. **Identifier changes must update all sites.** If you change how an identifier is resolved (e.g., adding a fallback), grep for every method that consumes that identifier. The lookup and the storage must use the same key — mismatches create duplicates silently.

3. **Never block sync on advisory features.** Duplicate detection, warnings, and review flags are advisory. They must not prevent event delivery to clients. Use `warnings` arrays in responses, not empty result sets.

4. **Adapter wrappers must forward all interface parameters.** The `ExternalSyncAdapterV2` interface defines `pull(since?: string)` and `push(entities)`. Wrappers in `syncServer.ts` must forward these — not silently drop them.

5. **Tenant isolation must be verified on every storage method.** Every `WHERE` clause touching `entities` or `events` tables must include `tenant_id`. Missing tenant filters are cross-tenant data corruption bugs.

6. **Test the second sync, not just the first.** First-sync tests pass trivially. The bugs appear on re-sync: duplicate entities from missing externalId, conflict resolution dropping valid updates, watermarks not advancing. Every sync test should include at least two sync cycles.

## Key Architectural Patterns

### Event Sourcing Implementation
- Events are immutable records of changes stored in EventStore
- EntityStore maintains current state by applying events
- EventApplierService handles event application logic
- Custom events can be registered via `eventApplierService.registerEventApplier()`

### Synchronization Architecture
- **InternalSyncManager**: Handles client ↔ server sync with pagination (10 records/page default)
- **ExternalSyncManager**: Handles server ↔ external system sync via adapters. Pull runs first, then push. The adapter manages its own push delta via `getModifiedEntitiesSince` — ExternalSyncManager does not gather entity payloads.
- **Pull timestamp**: `ExternalSyncManager` reads/writes `getLastPullExternalSyncTimestamp` / `setLastPullExternalSyncTimestamp` on EventStore, passing `since` through the V2 wrapper to the adapter. The adapter passes `_lastUpdated` to the external API.
- **Push timestamp**: The adapter reads/writes `getLastPushExternalSyncTimestamp` / `setLastPushExternalSyncTimestamp` directly on EventStore.
- Adapters available: OpenSPP (V2 REST, V1 Odoo), OpenFn, MockSyncServer
- Duplicate detection is skipped for remote/external events (`isRemoteEvent` check in `submitForm`) to prevent external pull from poisoning the duplicate queue.

### Storage Adapters
- Client-side: IndexedDb
- Server-side: Postgres

## Multi-Tenant Configuration

Backend supports multiple tenants via app config files. Config structure:
```json
{
  "id": "tenant-id",
  "name": "Tenant Name",
  "entityForms": [...],
  "entityData": [...],
  "externalSync": {
    "type": "adapter-type",
    "auth": "basic",
    "url": "http://external-system"
  }
}
```

## Authentication

- Initial admin user created on first server start
- JWT-based authentication for all API endpoints
- User roles: admin (manage users), user (sync data)
- Basic auth supported for external sync

## Important Implementation Notes

1. **Event Types**: Standard events include create-group, add-member, update-individual, delete-entity
2. **Sync Levels**: LOCAL (client-only), SYNCED (synchronized with server)
3. **Conflict Resolution**: Handled via version numbers and timestamps
4. **Pagination**: Internal sync processes 10 records per page by default
5. **Error Handling**: AppError class for consistent error management

## Known Pitfalls

- When producing audit or review reports, never force findings into round numbers. Report the actual count of issues found — artificial caps cause findings to be silently dropped or underclassified.
- **Sync bugs hide in seams.** Component-level tests with mocks will not catch sync integration failures. The most critical bugs in this codebase (Apr 2026 sync hardening — 50+ issues) were all in the wiring between components, not in any single component. See `.claude/post-mortems/2026-04-16_sync-production-hardening.md`.
- **Adapter wrappers in `syncServer.ts` must be kept in sync with the `ExternalSyncAdapterV2` interface.** If the interface adds a parameter, the wrapper must forward it. Past bug: wrapper dropped `since` parameter for 30 days, causing full re-pull on every sync.
- **IndexedDB `objectStore.put()` returns `IDBRequest`, not `Promise`.** Wrapping in `await` does not wait for the transaction to commit. Always wrap in `new Promise` that resolves on `transaction.oncomplete`.

## Security Disclosure Hygiene

This is a **public** repository. Do not expose exploitable vulnerability detail or internal tracker IDs (OpenProject `#nnnn`) in public artifacts — PR titles/descriptions, issue text, commit messages, or code/test comments.

- **Undisclosed vulnerabilities:** develop the fix in a private [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/about-repository-security-advisories) (GHSA) fork; merge and release; publish the advisory (and a CVE if warranted) only after users can upgrade. The detailed exploit narrative belongs in the post-release advisory, not the PR.
- **Public PR text** describes *what* changed — the control added, files touched, tests — never the attack path, preconditions, or exploitation steps.
- **No internal tracker IDs** in public PRs/commits/code. Reference the public advisory ID or omit. Cross-PR references (`#60`, `#61`) are fine (structural).
- **Code comments / test `describe()` names** name the control or behavior ("tenant-scoped approval guard"), not the vulnerability or ticket ("the #1135 vuln", "BOLA exploit").
- The goal is timing, not permanent secrecy: once a fix is released, an advisory/CVE and transparency are good — just don't hand attackers a roadmap before the patch ships.

## Commit Checklist

Before committing:

- [ ] Security fix: no exploit detail or internal tracker IDs in public PR/commit/code text (see Security Disclosure Hygiene)

- [ ] `pnpm pr-check` passes
- [ ] No `console.log` in `datacollect` or `backend` (use `createLogger`)
- [ ] No Node-only imports in `packages/datacollect/src/`
- [ ] No PII in log messages
- [ ] New storage adapters pass conformance tests
- [ ] New external adapters return `SyncResult` (never throw for per-entity errors)
- [ ] Sync changes: trace full data path (adapter → EventApplier → EntityStore → /pull → mobile)
- [ ] Sync changes: verify second-sync behavior (re-pull idempotency, no duplicate entities)
- [ ] Storage changes: every `WHERE` clause on `entities`/`events` includes `tenant_id`
- [ ] Conventional commit format: `feat(mobile):`, `fix(backend):`, etc.
- [ ] Single-line commit messages only — no body, description, or co-author trailers

---

### Playwright Browser Configuration
If Chromium is not found in the usual places, check Flatpak as well and do not use `npx playwright install`. Use the system's **Chromium Flatpak** to avoid library compatibility issues with the host.

| Setting | Value |
| :--- | :--- |
| **Executable Path** | `/usr/bin/flatpak` |
| **Required Args** | `['run', 'org.chromium.Chromium', '--remote-debugging-port=9222']` |
| **App ID** | `org.chromium.Chromium` |

### Environment Setup
* **Permissions**: Ensure the development environment has access to the `org.chromium.Chromium` bus. Use `flatpak-spawn --host` if running from within another Flatpak container (like VS Code).
* **Binary Discovery**: Always prefer absolute paths for system binaries (e.g., `/usr/bin/flatpak`) as `$PATH` can vary between the host and containerized shells.

### Troubleshooting Commands
* **Verify Installation**: `flatpak list --app | grep Chromium`
* **Test Launch**: `flatpak run org.chromium.Chromium --version`
* **Check Sandbox**: If launch fails, add `--no-sandbox` to the Playwright `args` array.
