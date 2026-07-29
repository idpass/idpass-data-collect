# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-rc.2] - 2026-04-14

Second release candidate for v2.0.0. Major additions: async external sync with progress tracking, sync status panel in admin UI, access control hardening, and DPGA compliance documentation.

### Added
- **Async external sync (push)** — external sync push jobs now run in the background with real-time progress tracking, cancellation support, and job history. Pull remains synchronous
- **Sync status panel** — new admin UI component shows live sync progress, history timeline, error details, and push/pull counts per job
- **Sync event persistence** — new `sync_events` table records every sync run with duration, counts, and error details for audit and debugging
- **DPGA submission docs** — added PRIVACY.md, GOVERNANCE.md, DO_NO_HARM.md, ACCESSIBILITY.md, and data export user guide for Digital Public Goods Alliance submission
- Live OpenSPP integration test suite (`describeIfOpenSpp` pattern — skips when env vars not set)
- ExportImportManager tests for data portability verification
- Display name field indicator on mobile entity forms

### Security
- **Access control hardening** — non-admin users now only see and sync programs they are assigned to
- Tenant access validation added to sync status, events, and job cancel endpoints
- Sync machine retries with refreshed token on 403 before failing
- Role assignments now persist correctly through all API layers
- Concurrent external sync requests rejected with 409 to prevent data races

### Fixed
- Mobile shows user-friendly messages for 401, 403, and 429 instead of raw HTTP codes
- OpenSPP adapter returns partial results on entity failures instead of throwing (allows "partial" sync status)
- OpenSPP adapter identifier type now configurable per entity type (was hardcoded to `national_id`)
- Backend forwards real push/pull counts from V2 adapter wrapper (was returning zeros)
- Sync progress preserved on failure — catch block no longer overwrites real counts
- Sync status logic corrected: push-ok/pull-error now shows "partial" instead of "failed"
- Progress writes flush on phase change regardless of throttle interval
- Admin polling handles 404 race condition on first sync job poll
- Display name resolution uses `_displayName` field with fallback chain across all packages
- Internal `_`-prefixed fields stripped from sync push payloads
- Mobile: loading overlay when adding programs, re-login button for stuck auth, login error surfacing
- Mobile: `authConfigs` added to RxDB schema so QR-loaded programs show login form
- Cross-origin resource policy set on static artifact files

### Changed
- Frontend code renamed from "tenant" to "program" terminology
- Review workflow and granular role assignments hidden from admin UI (backend code preserved for post-2.0.0 completion)
- `requireAction()` RBAC middleware removed from sync pull/push routes — access controlled by tenant membership only

### Deployment
- Docker Compose (Coolify): services join `coolify` external network for direct Traefik routing
- Postgres uses unique hostname `dc-postgres` to avoid DNS collision on shared Docker networks
- `pg_isready` healthcheck uses `-d` flag to suppress log spam

## [2.0.0-rc.1] - 2026-03-30

Release candidate for v2.0.0. Includes all beta.3 fixes plus documentation overhaul, website redesign, and package publishing infrastructure.

### Documentation
- Complete documentation audit: replaced Merkle tree references with hash chain, updated OpenSPP adapter class names after beta.2 rename, added OTP and National ID auth adapters to architecture docs
- Rewrote mobile package docs for Vuetify 3 / Material Design 3 (removed RxDB and Bootstrap references)
- Added missing documentation for biometric app lock, record entity type, duplicate detection, and strong password validation
- Created READMEs for web, backend, adapter-openspp, adapter-openfn, and adapter-mock packages
- Updated existing READMEs (admin, datacollect, mobile) for v2.0.0
- Updated entity-forms config, web app guide, and deployment docs
- Added changelog entries for beta.2, beta.3, and the final v2.0.0 release summary

### Website
- Redesigned docs site theme with ID PASS slate blue (#2C3E50) and orange (#ff6d37) palette
- Replaced gradient hero with solid slate blue and orange accent stripe
- Added diff syntax highlighting with green/red line backgrounds
- Converted developer and user guide overview pages to card-grid layouts
- Updated Mermaid component to use `theme: 'base'` with brand colors (fixes ColorTheme errors on Cloudflare Pages)
- Added ID PASS logo and favicon from idpass.org
- Simplified homepage to hero and two routing cards
- Removed OpenSPP V2 adapter beta label (adapter is production-ready)

### Package Publishing
- Added `.npmrc` with `@idpass` scope pointed at GitHub Packages registry
- Added `publishConfig` to all 5 publishable packages (core, backend, adapter-openspp, adapter-openfn, adapter-mock)
- Added `files` field to adapter packages to prevent shipping source and tests
- Created `publish-packages.yml` workflow with tag-driven and manual dispatch triggers
- Simplified `ci:install` script (removed dynamic `.npmrc` generation)

### Fixed
- Address v2.0.0 release review findings C1-C5, I1-I11
- Router guard blocking login pages and `window.db` race condition
- E2E test stabilization: strict mode violations, CORS_ORIGINS for dev servers, randomUUID for event GUIDs
- Deployment docs CORS_ORIGINS default corrected from `*` to deny-all

### CI
- Opt into Node.js 24 for all GitHub Actions; update pnpm action to v4
- Scope Playwright browser install to admin package
- Update workflow passwords and JWT secret to meet strength requirements

## [2.0.0] - 2026-04-21

Major release introducing offline-first web and mobile applications with event sourcing, multi-tenant sync, and comprehensive security hardening across four packages: `datacollect` (core), `backend` (Express sync server), `admin` (Vue.js dashboard), and `web` (self-service/agent portal). 410 commits since v1.0.0.

See pre-release changelogs for per-change detail: [rc.2](#200-rc2---2026-04-14), [rc.1](#200-rc1---2026-03-30), [beta.3](#200-beta3---2026-03-29), [beta.2](#200-beta2---2026-03-26), [beta.1](#200-beta1---2026-03-18).

### Breaking Changes
- `EntityPair.initial` is now nullable (entities not yet synced have `null`)
- Adapter imports moved: `@idpass/data-collect-core` → `@idpass/adapter-openspp`, `@idpass/adapter-openfn`
- Adapters must register via `AdapterRegistry` at startup
- `EntityDataManager.getEntity()` returns `EntityPair` (adds `guid`, nullable `initial`)
- JWT tokens expire after 1 hour (previously no expiry)
- `JWT_SECRET` must be ≥32 characters (server refuses to start otherwise)
- `CORS_ORIGINS` defaults to deny-all (must be set explicitly)
- `OpenSppSyncAdapter` removed — replaced by `OpenSppOdooSyncAdapter` (from `@idpass/adapter-openspp`)
- Frontend code renamed from "tenant" to "program" terminology throughout

### Added
- **Web App** (`packages/web`) — Vue 3 portal for field agent data collection and citizen self-service with OTP, National ID, and OIDC authentication
- **Mobile redesign** — rebuilt with Vuetify 3 and Material Design 3, biometric app lock (fingerprint/PIN) with auto-lock on background, secure storage (iOS Keychain / Android Keystore)
- **Async external sync (push)** — push jobs run in the background with real-time progress tracking, cancellation support, job history, and sync event persistence (`sync_events` table). Pull remains synchronous
- **Sync status panel** — admin UI component showing live progress, history timeline, error details, and push/pull counts per job
- **Hash chain integrity** — incremental hash chain replaces Merkle tree for event store tamper detection
- **XState v5 statecharts** — sync orchestration, mobile auth, and app lock flows managed by state machines
- **Selective sync** — filter sync by area IDs and entity GUIDs
- **Duplicate detection** — async detection with resolution UI in admin
- **File attachments** — upload/download with MIME type detection from magic bytes
- **Record entity type** — new entity type for activities, services, and home visits
- **Adapter registry** — V2 adapter interface with Zod config validation and dynamic registration
- **Adapter packages** — OpenSPP, OpenFn, and Mock adapters extracted to standalone `@idpass/adapter-*` packages
- **Configurable display name** — per-form display name field with indicator on mobile entity forms
- **Strong password validation** — clear error messages for password requirements
- **13 new backend services** — Area, Assignment, Attachment, SyncEvent, Conflict, Snapshot, Verification, ProjectionRebuild, SelfService, DuplicateDetection, Review, FormClassifier, RBAC
- **Package publishing** — `.npmrc` with `@idpass` scope, `publishConfig` on all 5 publishable packages, `publish-packages.yml` CI workflow with tag-driven and manual triggers
- **41+ Playwright E2E tests** across admin, backend, mobile, and cross-service integration
- **Drizzle ORM** schema definitions alongside raw SQL migrations
- **Mock registry reference server** (`examples/mock-server`) — Python + Litestar + SQLite, PublicSchema-aligned Person/Group/Identifier/IdentityDocument model, OAuth2 client credentials with JWT, Swagger UI, editorial UI with client management, auto-seed fixture (2 households + 5 persons)
- **`@idpass/adapter-mock` V2 rewrite** — OAuth2 HTTP client against the reference mock registry (replaces the in-process V1 mock). Serves as the canonical reference adapter for third-party integrators
- **Building-an-adapter guide** — step-by-step walkthrough using the mock registry as the worked example, plus a PublicSchema alignment note
- **`pnpm seed` mock-registry integration** — provisions a `demo-mock-registry` tenant and best-effort seeds the mock server (auto-detects `docker`/`podman compose`), enabling end-to-end external sync demo without OpenSPP

### Security
- JWT 1-hour expiry with token refresh endpoint
- OIDC hardening: JWKS URI origin validation, issuer pre-validation (prevents SSRF), audience + nonce checks
- Tenant isolation middleware on all tenant-scoped routes
- Program-level access control: non-admin users only see and sync assigned programs
- Self-service token scope enforcement and entity isolation (prevents cross-entity enumeration)
- OTP codes hashed with HMAC-SHA256 and verified with constant-time comparison
- Rate limiting on OTP, verification, and public endpoints
- Zod input validation on all self-service endpoints
- Filename sanitization on ingestion (null bytes, path traversal, header injection)
- Concurrent external sync requests rejected with 409 to prevent data races
- Sync machine retries with refreshed token on 403 before failing
- HTTPS-only in production mobile builds
- Non-root Docker containers
- Cross-origin resource policy on static artifact files
- Post-rc.2 code review sweep: resolved 1 critical (C2), 2 high (H1/H2), and 2 low (L1/L2) severity findings in sync and adapter paths
- Mock registry server: bcrypt-hashed OAuth2 client secrets, rotatable without redeploy; session cookies `httponly` + `samesite=strict`

### Documentation
- Complete documentation audit: Merkle tree → hash chain, updated adapter class names, added OTP and National ID auth adapters to architecture docs
- Package READMEs for web, backend, admin, mobile, datacollect, adapter-openspp, adapter-openfn, and adapter-mock
- DPGA compliance documentation: PRIVACY.md, GOVERNANCE.md, DO_NO_HARM.md, ACCESSIBILITY.md, and data export user guide
- Mobile docs rewritten for Vuetify 3 / Material Design 3 (removed RxDB and Bootstrap references)
- Added docs for biometric app lock, record entity type, duplicate detection, and strong password validation
- Final v2.0.0 docs pass: corrected `@idpass/data-collect-core` package name across all docs and JSDoc sources, password/JWT strength requirements in `.env.example`, repeatable Docker + host + embed installation paths verified end-to-end
- All docs migrated from `npm` to `pnpm` commands; fixed broken markdown links in code blocks
- Mock registry + adapter documented across `external-sync.md`, `adapter-registry.md`, `packages/backend/index.md`, getting-started, and the new `building-an-adapter.md`
- Review workflow doc unlisted from sidebar (matches hidden UI state)
- Sync testing requirements and production pitfalls added to `CLAUDE.md` from the sync hardening post-mortem

### Website
- Redesigned theme with ID PASS slate blue (#2C3E50) and orange (#ff6d37) palette
- Solid hero with orange accent stripe, ID PASS logo and favicon
- Card-grid layouts for developer and user guide pages
- Diff syntax highlighting with green/red line backgrounds
- Mermaid diagrams use `theme: 'base'` with brand colors

### Fixed
- Hash chain false tamper detection — `syncLevel` excluded from hash computation
- Mobile white screen instability — sync decoupled from UI lifecycle
- Sync cursor derived from successful chunks only (prevents advancing past failures)
- FormSubmission cloned before mutation in EventStore.saveEvent
- OpenSPP adapter returns partial results on entity failures instead of throwing
- OpenSPP identifier type now configurable per entity type (was hardcoded to `national_id`)
- Backend forwards real push/pull counts from V2 adapter wrapper (was returning zeros)
- Sync progress preserved on failure — catch block no longer overwrites real counts
- Sync status logic corrected: push-ok/pull-error shows "partial" instead of "failed"
- Progress writes flush on phase change regardless of throttle interval
- Polling handles 404 race condition on first sync job poll
- Display name resolution uses `_displayName` field with fallback chain across all packages
- Internal `_`-prefixed fields stripped from sync push payloads
- Mobile: user-friendly messages for 401, 403, and 429 instead of raw HTTP codes
- Mobile: loading overlay when adding programs, re-login button for stuck auth, login error surfacing
- Mobile: `authConfigs` added to RxDB schema so QR-loaded programs show login form
- Router guard blocking login pages and `window.db` race condition
- Duplicate event push handled idempotently with ON CONFLICT DO NOTHING
- Config schema validation and duplicate check reliability
- FormIO component initialization error in production builds
- SecureStorage initialization on Android (eager import shim)
- Sync round 2 hardening: push identifier mismatch, area cursor advancement, IndexedDB writes now wait on `transaction.oncomplete` (not `IDBRequest`), conflict retry on concurrent modification
- OpenSPP: only advance push watermark on zero failures (prevents silent entity loss on partial push)
- OpenSPP: skip push-back of pull-only entities (prevents stale overwrite of external source-of-truth)
- OpenSPP: `_lastUpdated` pull filter uses `ge` prefix and date-only format (matches Odoo query semantics)
- OpenSPP: null-safety on identifier extraction for groups and individuals with missing records
- OpenSPP: default push identifier type changed from `national_id` to `system_id` (avoids cross-tenant collisions when DC entities lack real identifiers)
- Admin: `entityType` required on form config wizard (Auto-inference removed); backend Zod schema includes `entityType` to prevent silent strip on save
- Mobile: `FLAG_SECURE` applied only in release builds so QA can screen-mirror debug APKs
- Mobile: `ApplicationInfo.FLAG_DEBUGGABLE` replaces `BuildConfig.DEBUG` for runtime debug check
- Mobile: QR scanning uses `BarcodeScanner.requestPermissions` (Camera plugin path was broken on Android 14+)
- Mobile: externally-pulled entities now match by type when `entityName` doesn't match form name
- Adapter-mock: server UUIDs used as `externalId`, cross-env base64 encoding, HTTP 409 maps to `skipped` (not error)
- Adapter-mock: OAuth2 token request is form-encoded per RFC 6749
- Mock server: `MOCK_CORS_ALLOWED_ORIGINS` parsed as comma-separated string
- Mock server: autocommit on 3xx so UI-form create redirects persist the new row
- Mock server: Dockerfile compatible with podman (dropped optional-file glob)
- CI: `adapter-mock` Jest alias wired, `uv.lock` committed for reproducible Python builds

### Changed
- `OpenSppSyncAdapterV2` renamed to `OpenSppOdooSyncAdapter`; legacy `OpenSppSyncAdapter` removed
- `useBarcodeScan` composable extracted from duplicated scanner logic
- Review workflow and granular role assignments hidden from admin UI and documentation (backend code preserved for post-2.0.0)
- `requireAction()` RBAC middleware removed from sync routes — access controlled by tenant membership
- V1 adapter infrastructure (`LegacyAdapterWrapper`) extracted from `ExternalSyncManager` into `legacyAdapterSupport.ts`; built-in `MockSyncServerAdapter` removed from core
- `@idpass/adapter-mock` no longer ships an in-process mock — HTTP-only against the reference mock registry

### Improved
- Pino-based structured logging replaces console.log throughout backend and core
- Composite cursor (`timestamp|eventGuid`) pagination prevents event skipping during sync
- Transactional sync push — all events in a batch commit or rollback atomically
- Docker multi-stage builds with nginx for frontend SPAs
- Node.js 24 support across all CI workflows
- ESM-compatible Vite configs for mobile and web packages
- PR check script with Podman/Docker auto-detection

### Deployment Notes
1. **Required:** Set `JWT_SECRET` to ≥32 characters (server refuses to start otherwise)
2. **Required:** Set `CORS_ORIGINS` explicitly (defaults to deny-all)
3. **Run DB migrations** — new tables: `users`, `areas`, `userAssignments`, `entityOverrides`, `entitySnapshots`, `attachments`, `attachmentData`, `otp_codes`, `submission_reviews`, `review_configs`, `verifications`, `sync_events`
4. Update adapter imports from `@idpass/data-collect-core` to `@idpass/adapter-openspp` / `@idpass/adapter-openfn`
5. Audit all `entityPair.initial` access for null checks
6. Replace `OpenSppSyncAdapter` with `OpenSppOdooSyncAdapter`
7. Coolify deployments: services must join the `coolify` external network; use unique Postgres hostname (`dc-postgres`) to avoid DNS collision
8. Existing mock-adapter deployments: update external sync config from in-process shape to HTTP shape (`type: "mock"`, `url`, `adapterConfig: { clientId, clientSecret, identifierScheme, identifierType }`); the in-process V1 mock is no longer registered
9. Optional: enable the mock registry service in staging/demo with `docker compose -f docker/docker-compose.dev.yaml --profile mock up -d` and run `pnpm seed` to provision the `demo-mock-registry` tenant

## [2.0.0-beta.2] - 2026-03-26

### Added
- Mobile UI redesigned with Vuetify 3 and Material Design 3
- Web dev mode with platform service and native stubs
- Configurable display name field for entity forms
- Confirmation dialog when creating a program with a duplicate name
- Strong password validation with clear error messages
- Silent re-authentication on token expiry during sync
- Sync history shows request/response payloads in dev builds
- Global back button in mobile app bar
- Mobile Playwright E2E tests for auth and sync flows

### Fixed
- Hash chain false tamper detection — syncLevel excluded from hash
- Mobile white screen instability — sync decoupled from UI lifecycle
- FormIO component initialization error in production builds
- JWT expiry check and fail-fast on 401 during sync
- Enriched sync error messages with HTTP status and server response
- Duplicate event push handled idempotently with ON CONFLICT DO NOTHING
- Duplicate events skipped in transactional batch before processing
- Config schema validation and duplicate check reliability
- Accept null fields in uploaded config JSON
- External sync errors propagated to admin UI
- Members processing guarded with Array.isArray
- OpenSPP V2 test-connection and field-fetch moved to backend endpoints
- OpenSPP adapter registered correctly per protocol version
- V2 adapter accepts both OAuth2 and Odoo credentials
- Field mappings used for core individual fields instead of hardcoded names

### Changed
- `OpenSppSyncAdapterV2` renamed to `OpenSppOdooSyncAdapter`
- Legacy `OpenSppSyncAdapter` removed — `OpenSppOdooSyncAdapter` is canonical V1
- `useBarcodeScan` composable extracted from duplicated scanner logic
- ESM-compatible Vite configs for mobile and web packages

### CI
- Backend, admin, and mobile E2E tests included in pr-check

## [2.0.0-beta.3] - 2026-03-29

### Fixed
- Address v2.0.0 release review findings C1-C5, I1-I11
- Router guard blocking login pages and `window.db` race condition
- E2E: strict mode violations with exact text matching and getByRole selectors
- E2E: stabilize mobile seedTenantConfig and increase integration test timeouts
- E2E: add CORS_ORIGINS for admin and web dev servers in CI
- E2E: use randomUUID() for event GUIDs in integration tests
- E2E: fix admin button selector and default password in CI

### CI
- Opt into Node.js 24 for all GitHub Actions; update pnpm action to v4
- Scope Playwright browser install to admin package
- Use `pnpm exec` instead of `npx` for Playwright install
- Update workflow passwords and JWT secret to meet strength requirements
- Allow Playwright to reuse existing dev server in all environments

## [2.0.0-beta.1] - 2026-03-18

### Breaking Changes
- `EntityPair.initial` is now nullable (entities not yet synced have `null`)
- Adapter imports moved: `@idpass/data-collect-core` → `@idpass/adapter-openspp`, `@idpass/adapter-openfn`
- Adapters must register via `AdapterRegistry` at startup
- `EntityDataManager.getEntity()` returns `EntityPair` (adds `guid`, nullable `initial`)
- JWT tokens expire after 1 hour (previously no expiry)
- `JWT_SECRET` must be ≥32 characters (server refuses to start otherwise)
- `CORS_ORIGINS` defaults to deny-all (must be set explicitly)

### Added
- **Web App** (`packages/web`): Vue 3 app for agent data collection and citizen self-service (OTP, National ID, OIDC authentication)
- **Hash Chain Integrity**: Incremental hash chain replaces Merkle tree for event store tamper detection
- **XState v5 Sync**: InternalSyncManager replaced with XState v5 statechart for reliable sync orchestration
- **XState v5 Mobile Auth/Lock**: Authentication and app lock flows managed by XState statecharts
- **Selective Sync**: Filter sync by area IDs and entity GUIDs
- **Biometric App Lock**: Fingerprint/PIN lock on mobile with auto-lock on background
- **Secure Storage**: Mobile secrets migrated to iOS Keychain / Android Keystore
- **Review Workflow**: Submission review pipeline (pending/approved/rejected) with DB persistence
- **Duplicate Detection**: Async duplicate detection and resolution UI in admin
- **Attachments**: File upload/download with MIME type detection from magic bytes
- **Record Entity Type**: New entity type for activities, services, home visits
- **Adapter Registry**: V2 adapter interface with Zod validation and dynamic registration
- **Adapter Packages**: OpenSPP, OpenFn, and Mock adapters extracted to standalone packages
- **FormClassifier**: Centralized form-to-event-type classification
- **13 New Services**: EventUpcaster, RBAC, Area, Assignment, Attachment, Conflict, Snapshot, Verification, ProjectionRebuild, SelfService, DuplicateDetection, Review, FormClassifier
- **E2E Tests**: Playwright setup with 41+ tests across admin, backend, and cross-service
- **Error Overlay**: Production-visible error overlay on mobile for QA crash reporting
- **Drizzle ORM**: Schema definitions for new tables alongside raw SQL

### Security
- JWT 1-hour expiry with token refresh endpoint
- OIDC: JWKS URI origin validation, issuer pre-validation (prevents SSRF), audience + nonce checks
- Tenant isolation: `validateTenantAccess()` middleware on all tenant-scoped routes
- Self-service token scope enforcement (cannot access admin/sync routes)
- Entity isolation for self-service tokens (prevents cross-entity enumeration)
- OTP codes hashed with HMAC-SHA256 and verified with constant-time comparison
- Rate limiting on OTP, verification, and public endpoints
- Zod input validation on all self-service endpoints
- Filename sanitization on ingestion (null bytes, path traversal, header injection)
- HTTPS-only in production mobile builds
- Non-root Docker containers

### Improved
- Pino-based structured logging replaces console.log throughout backend and core
- Composite cursor (`timestamp|eventGuid`) for pagination prevents event skipping
- Transactional sync push (all events in a batch commit or rollback atomically)
- Docker: multi-stage Dockerfile, nginx for frontend SPAs, Coolify-compatible compose configs
- PR check script with Podman/Docker auto-detection
- License header enforcement across all source files

### Fixed
- Sync cursor derived from successful chunks only (prevents advancing past failed uploads)
- FormSubmission cloned before mutation in EventStore.saveEvent
- URL-encoded composite cursor in sync pull URL
- Cross-origin QR code and config artifact loading (CORP header fix)
- SecureStorage initialization on Android (eager import shim for inlineDynamicImports compatibility)
- Storage permissions for QR code scanning from gallery
- Biometric auth error details surfaced on lock screen

### Deployment Notes
1. Set `JWT_SECRET` to ≥32 characters (server won't start otherwise)
2. Set `CORS_ORIGINS` explicitly (defaults to deny-all)
3. Run DB migrations — new tables: `users`, `areas`, `userAssignments`, `entityOverrides`, `entitySnapshots`, `attachments`, `attachmentData`, `otp_codes`, `submission_reviews`, `review_configs`, `verifications`
4. Update adapter imports from `@idpass/data-collect-core` to `@idpass/adapter-openspp` / `@idpass/adapter-openfn`
5. Audit all `entityPair.initial` access for null checks

## [1.3.0-beta.1] - 2026-02-24

### Added
- **OpenSPP V2 Adapter**: New adapter with updated API integration and wizard flow
- Seed data script for demo environment (`pnpm seed`)
- One-command local test setup
- Claim-169 scanner integration in mobile UI

### Fixed
- Sync-server startup race condition in dev compose
- Hard-coded invalid identifier namespace
- Scanner viewport missing on mobile
- CI error on docs build
- Missing step for type-check in CI

### Improved
- OpenSPP V1 field fetching updated
- Mobile list item spacing

## [1.2.0-beta.1] - 2026-01-16

### Added
- **OpenSPP Field Mapping**: Configurable field mapping with transformer support (text, date, ID, multi-select, boolean)
- **Biometric Capture**: BCA (Biometric Capture Application) integration with skip option
- Admin entities list view
- Mobile event list in entity details
- Mobile QR scanner improvements
- OpenSPP adapter documentation

### Fixed
- Sync issue with timestamps causing duplicates during sync
- OpenSPP push sync failures
- Generated QR code not using Railway public URL
- Text transformer saving "false" instead of empty string
- Update event not using field mapper
- Admin form input trimming
- Mobile APK build output
- Display missing entities on mobile
- Duplicate program error message on mobile

### Improved
- Admin layout updated
- Admin search filter section cleaned up
- Request batching for OpenSPP sync
- Docker Compose configs for OpenSPP and Portainer
- Live reload with watchers for development

## [1.0.0] - 2025-09-24

### Added

- Initial release of the ID PASS DataCollect platform.
- Core `datacollect` library for offline-first data management.
- `backend` server for synchronization and data storage.
- `admin` web interface for system administration.
- `mobile` application for data collection in the field.
- Comprehensive documentation website.
