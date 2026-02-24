# Plan: Automatic Submission Location Capture

## Detailed TODO

### Phase 1: Core data model (datacollect package)

- [x] **1.1** Add `CapturedLocation` interface to `packages/datacollect/src/interfaces/types.ts`
- [x] **1.2** Add `FormSubmissionMetadata` interface to same file
- [x] **1.3** Add optional `metadata?: FormSubmissionMetadata` field to `FormSubmission` interface
- [x] **1.4** Verify the new types are exported (file is re-exported via `index.ts`)
- [x] **1.5** Commit: `feat(datacollect): add CapturedLocation and metadata to FormSubmission`

### Phase 2: Docker PostGIS setup

- [x] **2.1** Change `postgres:15` to `postgis/postgis:15-3.5` in `docker/docker-compose.yaml`
- [x] **2.2** Change `postgres:15` to `postgis/postgis:15-3.5` in `docker/docker-compose.dev.yaml`
- [x] **2.3** Commit: `chore(docker): switch to postgis image`

### Phase 3: Postgres storage adapter (TDD)

- [x] **3.1** Write failing test: save a FormSubmission with `metadata.capturedLocation`, retrieve it, assert metadata round-trips correctly
- [x] **3.2** Write failing test: save a FormSubmission with `metadata.capturedLocation`, run raw SQL `SELECT ST_AsGeoJSON(captured_location)`, assert valid GeoJSON
- [x] **3.3** Write failing test: save a FormSubmission without metadata, retrieve it, assert `metadata` is `undefined`
- [x] **3.4** Add `CREATE EXTENSION IF NOT EXISTS postgis` to `initialize()` before CREATE TABLE
- [x] **3.5** Add `metadata JSONB` and `captured_location geometry(Point, 4326)` columns to the CREATE TABLE statement
- [x] **3.6** Add partial spatial index `idx_events_captured_location` using GIST
- [x] **3.7** Update `saveEvents()` INSERT to include metadata (param $9) and ST_MakePoint (params $10, $11)
- [x] **3.8** Update `getEvents()` — add `metadata` to SELECT and row mapper
- [x] **3.9** Update `getEventsSince()` — add `metadata` to SELECT and row mapper
- [x] **3.10** Update `getEventsSincePagination()` — add `metadata` to SELECT and row mapper
- [x] **3.11** Run tests, verify all pass
- [x] **3.12** Commit: `feat(datacollect): store submission metadata and PostGIS point in events table`

### Phase 4: IndexedDB adapter verification

- [x] **4.1** Write test: save FormSubmission with metadata via IndexedDB adapter, retrieve it, assert metadata round-trips
- [x] **4.2** Write test: save FormSubmission without metadata, assert it still works (backward compat)
- [x] **4.3** Verify tests pass without any code changes to the IndexedDB adapter
- [x] **4.4** Commit: `test(datacollect): verify IndexedDB metadata round-trip`

### Phase 5: Build datacollect

- [x] **5.1** Run `npm run build` in `packages/datacollect`
- [x] **5.2** Run `npm run test` in `packages/datacollect` — all tests green
- [x] **5.3** Verify no lint errors

### Phase 6: Backend config types

- [x] **6.1** Add `captureLocation?: boolean` to `EntityForm` in `packages/backend/src/types.ts`
- [x] **6.2** Add `captureSubmissionLocation?: boolean` to `AppConfig` in same file
- [x] **6.3** Commit: `feat(backend): add location capture config flags to AppConfig and EntityForm`

### Phase 7: Mobile config types

- [x] **7.1** Add `captureLocation?: boolean` to `EntityForm` in `packages/mobile/src/utils/dynamicFormIoUtils.ts`
- [x] **7.2** Add `captureSubmissionLocation?: boolean` to `Config` in same file
- [x] **7.3** Add `captureSubmissionLocation: { type: 'boolean' }` to RxDB schema properties in `packages/mobile/src/schemas/tenantApp.schema.ts`
- [x] **7.4** Commit: `feat(mobile): add location capture config flags to mobile types`

### Phase 8: Config resolver (TDD)

- [x] **8.1** Write failing test: `entityForm.captureLocation = true`, tenant default false -> returns true
- [x] **8.2** Write failing test: `entityForm.captureLocation = false`, tenant default true -> returns false
- [x] **8.3** Write failing test: `entityForm.captureLocation = undefined`, tenant `captureSubmissionLocation = true` -> returns true
- [x] **8.4** Write failing test: both undefined -> returns false
- [x] **8.5** Implement `shouldCaptureLocation()` in NEW `packages/mobile/src/utils/locationConfig.ts`
- [x] **8.6** Run tests, verify all pass
- [x] **8.7** Commit: `feat(mobile): add shouldCaptureLocation config resolver`

### Phase 9: Geolocation utility (TDD)

- [x] **9.1** Write failing test: mock Capacitor on mobile platform, verify returns `CapturedLocation` with all fields
- [x] **9.2** Write failing test: mock browser `navigator.geolocation` on web platform, verify returns `CapturedLocation`
- [x] **9.3** Write failing test: permission denied -> returns null
- [x] **9.4** Write failing test: timeout -> returns null
- [x] **9.5** Write failing test: `navigator.geolocation` undefined -> returns null
- [x] **9.6** Write failing test: Capacitor throws -> returns null (never throws)
- [x] **9.7** Implement `getCurrentPosition()` in NEW `packages/mobile/src/utils/geolocation.ts`
- [x] **9.8** Run tests, verify all pass
- [x] **9.9** Commit: `feat(mobile): add geolocation utility wrapping Capacitor and browser APIs`

### Phase 10: Privacy disclosure component

- [x] **10.1** Create NEW `packages/mobile/src/components/LocationDisclosure.vue`
- [x] **10.2** Write test: renders explanation text when visible
- [x] **10.3** Write test: emits `acknowledged` on button click
- [x] **10.4** Write test: not rendered when `visible` is false
- [x] **10.5** Commit: `feat(mobile): add one-time location privacy disclosure component`

### Phase 11: Mobile integration — form views

- [x] **11.1** `DynamicNewView.vue` — add imports: `getCurrentPosition`, `shouldCaptureLocation`, `CapturedLocation`
- [x] **11.2** `DynamicNewView.vue` — add refs: `pendingLocation`, `locationStatus`, `showDisclosure`
- [x] **11.3** `DynamicNewView.vue` — in `onMounted`: check `shouldCaptureLocation()`, if enabled: check disclosure flag, show disclosure if needed, then call `getCurrentPosition()` and update refs
- [x] **11.4** `DynamicNewView.vue` — add pin icon to `top-bar__actions` area, bound to `locationStatus`
- [x] **11.5** `DynamicNewView.vue` — in `onSubmit`: if `pendingLocation` is set, attach `metadata: { capturedLocation: pendingLocation }` to FormSubmission
- [x] **11.6** `DynamicNewView.vue` — add `<LocationDisclosure>` component with acknowledgment handler
- [x] **11.7** `DynamicEditView.vue` — same changes as 11.1-11.6 (adapted for edit flow)
- [x] **11.8** Add CSS for pin icon states (hollow/filled) using existing `.badge` pattern
- [x] **11.9** Commit: `feat(mobile): wire up GPS capture and status indicator in form views`

### Phase 12: Permission request at app startup

- [x] **12.1** Identify the right place to request permissions early (login success handler or app init in `main.ts`)
- [x] **12.2** Add logic: if any tenant config has `captureSubmissionLocation: true`, request geolocation permission
- [x] **12.3** Commit: `feat(mobile): request location permission at app startup`

### Phase 13: Backend sync integration tests

- [x] **13.1** Write test: push a FormSubmission with `metadata.capturedLocation` to `/api/sync/push`, verify it's accepted
- [x] **13.2** Write test: pull it back from `/api/sync/pull`, verify `metadata.capturedLocation` is intact with all fields
- [x] **13.3** Write test: verify `captured_location` geometry column is populated via raw SQL query
- [x] **13.4** Write test: push a FormSubmission without metadata, verify it works (backward compat)
- [x] **13.5** Run full test suite
- [x] **13.6** Commit: `test(backend): add sync integration tests for submission location metadata`

### Phase 14: Final verification

- [ ] **14.1** Run `npm run build` in datacollect
- [ ] **14.2** Run `npm run test` in datacollect — all green
- [ ] **14.3** Run `npm run test` in backend — all green
- [ ] **14.4** Run `npm run test:unit` in mobile — all green
- [ ] **14.5** Run `npm run type-check` in mobile — no errors
- [ ] **14.6** Run `npm run lint` in mobile — no errors
- [ ] **14.7** Manual smoke test if device available
- [ ] **14.8** Commit any final fixes
