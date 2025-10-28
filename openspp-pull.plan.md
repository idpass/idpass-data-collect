# OpenSPP Pull Sync Plan

## Goals

- Implement the OpenSPP `pullData` flow so households and individuals fetched from OpenSPP are persisted as DataCollect events.
- Leverage adapter configuration mappings for transforming remote payloads.
- Maintain sync timestamps and error handling parity with push logic.
- Keep implementation simple and do not try and perform complex field mapping and transformations

## Steps

1. **Data Fetch Layer**
   - Extend `OdooClient` with helpers to `search_read` partners (households vs individuals) filtered by modification date.
   - Support paging via offset/limit (start with single page, log when more data exists).

2. **Transformation**
   - Map OpenSPP partner records into `FormSubmission` objects (`create-group` / `create-individual`).
   - Use adapter options for field mapping; attach `externalId` and `SyncLevel.EXTERNAL`.
   - create modules for each field map so each file will handle the logic for each type of event; this also opens up handling of more fields later

3. **Apply Remote Events**
   - Invoke `eventApplierService.submitForm` per transformed record.
   - Track latest remote `write_date` to update pull timestamp once batch succeeds.

4. **Error Handling & Logging**
   - Gracefully skip records lacking required identifiers.
   - Surface aggregated errors while continuing with remaining data.

5. **Tests & Docs**
   - Add unit tests for transform helpers and pull flow (mocking OdooClient & EventApplierService).
   - Update `packages/datacollect/README.md` (and docs) to note pull support & config expectations.

## Todos

- data-fetch
- transform-events
- apply-events
- tests-docs

## Changes Made

### OdooClient Migration (2025-10-28)

Replaced the JSON-RPC based `OdooClient.ts` with XML-RPC implementation from `OdooClient_v1.ts` because:
- The current implementation assumed OpenSPP features not yet in a stable branch
- XML-RPC is the standard protocol for Odoo external API
- Maintains all required methods for push/pull sync operations

**Key changes:**
- Switched from `axios` to `xmlrpc` library for Node.js environments
- Updated authentication flow to use XML-RPC `common` endpoint
- Adapted `createHousehold` to automatically link to root group
- Simplified `write` method to handle Odoo's expected parameter format
- Maintained backward compatibility with all existing adapter methods
- All tests pass successfully

### Browser/Mobile Compatibility Fix (2025-10-28)

Added browser-compatible OdooClient implementation to fix runtime errors in mobile app:
- Created `OdooClient.browser.ts` using JSON-RPC (axios) for browser environments
- Created `OdooClient.index.ts` that exports appropriate client based on environment
- `xmlrpc` library is Node.js-only and cannot run in browser/Capacitor environments
- Mobile/browser builds use JSON-RPC; backend uses XML-RPC
- Updated mobile Vite config to force browser resolution (`conditions: ['browser', ...]`)
- Added `optimizeDeps.exclude: ['xmlrpc']` to prevent bundling Node.js-only dependencies
- Both implementations provide identical API surface
- Solution: Runtime detection + build-time tree-shaking

### Odoo Many2many Field Fix (2025-10-28)

Fixed `IndexError: list index out of range` when linking members to groups:
- Issue: `kind` field in `group_membership_ids` is a Many2many field requiring Odoo commands
- Changed from `[[membershipKind]]` to `[[6, 0, [membershipKind]]]` format
- Command `(6, 0, [ids])` means "replace all links with these IDs"
- Updated `GroupMembership` type to support both formats
- Updated Postman collection with correct Many2many command format
- Added validation to only set `kind` when value > 0 (prevents "only one head" errors)
- Documented common kind values: 1=Head, 2=Spouse, 3=Child, 4=Other

### JSON-RPC kwargs Parameter Fix (2025-10-28)

Fixed `limit` parameter not working in search_read requests:
- Issue: `kwargs` was being passed as 7th element in `args` array
- Correct format: `kwargs` should be a separate key in `params` object
- Changed from: `args: [..., kwargs]` to `args: [...], kwargs: {...}`
- Now matches Odoo's JSON-RPC specification and Postman collection format
- Limit, fields, and other options now work correctly
