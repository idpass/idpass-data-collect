# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-MM-DD

Major release introducing offline-first web and mobile applications with event sourcing, multi-tenant sync, and comprehensive security hardening. See [2.0.0-beta.1](#200-beta1---2026-03-18), [2.0.0-beta.2](#200-beta2---2026-03-26), and [2.0.0-beta.3](#200-beta3---2026-03-29) for detailed per-change history.

### Breaking Changes
- `EntityPair.initial` is now nullable (entities not yet synced have `null`)
- Adapter imports moved: `@idpass/data-collect-core` → `@idpass/adapter-openspp`, `@idpass/adapter-openfn`
- Adapters must register via `AdapterRegistry` at startup
- `EntityDataManager.getEntity()` returns `EntityPair` (adds `guid`, nullable `initial`)
- JWT tokens expire after 1 hour (previously no expiry)
- `JWT_SECRET` must be ≥32 characters (server refuses to start otherwise)
- `CORS_ORIGINS` defaults to deny-all (must be set explicitly)
- `OpenSppSyncAdapter` removed — replaced by `OpenSppOdooSyncAdapter` (from `@idpass/adapter-openspp`)

### Added
- Web App (`packages/web`) for agent data collection and citizen self-service with OTP, National ID, and OIDC authentication
- Mobile UI redesigned with Vuetify 3 and Material Design 3
- Hash chain integrity replaces Merkle tree for event store tamper detection
- XState v5 statecharts for sync orchestration and mobile auth/lock flows
- Selective sync by area IDs and entity GUIDs
- Biometric app lock (fingerprint/PIN) with auto-lock on background
- Secure storage on mobile (iOS Keychain / Android Keystore)
- Review workflow with submission pipeline (pending/approved/rejected)
- Duplicate detection with async resolution UI
- File attachments with MIME type detection from magic bytes
- Record entity type for activities, services, and home visits
- Adapter registry with Zod validation and dynamic registration
- OpenSPP, OpenFn, and Mock adapters extracted to standalone packages
- 13 new backend services (RBAC, Area, Assignment, Attachment, Review, and more)
- 41+ Playwright E2E tests across admin, backend, and integration
- Drizzle ORM schema definitions alongside raw SQL
- Configurable display name field for entity forms
- Strong password validation with clear error messages

### Security
- JWT 1-hour expiry with token refresh
- OIDC: JWKS URI origin validation, issuer pre-validation, audience + nonce checks
- Tenant isolation middleware on all tenant-scoped routes
- Self-service token scope enforcement and entity isolation
- OTP codes hashed with HMAC-SHA256 and constant-time comparison
- Rate limiting on OTP, verification, and public endpoints
- Zod input validation on all self-service endpoints
- Filename sanitization (null bytes, path traversal, header injection)
- HTTPS-only in production mobile builds
- Non-root Docker containers

### Improved
- Pino-based structured logging replaces console.log throughout
- Composite cursor pagination prevents event skipping during sync
- Transactional sync push (batch commit or rollback atomically)
- Docker multi-stage builds with nginx for frontend SPAs
- Node.js 24 support in CI

### Deployment Notes
1. Set `JWT_SECRET` to ≥32 characters (server won't start otherwise)
2. Set `CORS_ORIGINS` explicitly (defaults to deny-all)
3. Run DB migrations — new tables: `users`, `areas`, `userAssignments`, `entityOverrides`, `entitySnapshots`, `attachments`, `attachmentData`, `otp_codes`, `submission_reviews`, `review_configs`, `verifications`
4. Update adapter imports from `@idpass/data-collect-core` to `@idpass/adapter-openspp` / `@idpass/adapter-openfn`
5. Audit all `entityPair.initial` access for null checks
6. Replace `OpenSppSyncAdapter` with `OpenSppOdooSyncAdapter`

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
