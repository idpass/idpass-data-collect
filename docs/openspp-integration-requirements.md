# OpenSPP Integration Requirements: Attendance Tracking & Offline Redemption

**Document type:** Technical requirements specification for the OpenSPP team
**Date:** 2026-02-19
**DataCollect branch:** `feature/attendance-redemption`
**Status:** Ready for implementation

---

## 1. Overview

The DataCollect mobile application has implemented two features on branch `feature/attendance-redemption`:

1. **Attendance Tracking** -- Record individual attendance at sessions, classes, and distribution events. Supports check-in (scan-based) and roll-call (group roster) modes. All attendance records are stored locally as events and applied via `AttendanceEventApplier`.

2. **Offline Entitlement Redemption** -- A point-of-sale workflow that allows field workers to redeem beneficiary entitlements (cash or in-kind) while offline. Includes identity confirmation, receipt generation (`RCP-{YYYYMMDD}-{DEVICEID}-{SEQ}`), balance tracking, duplicate detection, and supervisor-verified void operations. All redemption state is managed via three event appliers: `grantEntitlementApplier`, `redeemEntitlementApplier`, and `voidRedemptionApplier`.

**What is complete on the DataCollect side:**

- Event appliers for all four event types (`record-attendance`, `grant-entitlement`, `redeem-entitlement`, `void-redemption`)
- Mobile UI (Vue.js) for both attendance and redemption workflows
- Backend app configs (`attendance-tracker.json`, `entitlement-redemption.json`)
- Receipt number generation (offline and server)
- Pinia stores for session state management
- Router integration with auto-redirect based on `customEventTypes`
- Full test coverage for all components

**What OpenSPP needs to provide:**

- API endpoints for entitlement querying, redemption, and voiding (Section 2)
- A service point listing endpoint (Section 2.4)
- Enhanced entitlement response schema with balance fields (Section 2.5)
- Attendance models and API endpoints (Section 4)
- Optional model changes for cash pre-allocation (Section 5)

Once the OpenSPP endpoints are available, the DataCollect team will implement the V2 sync adapter extension to connect the two systems (Section 6).

---

## 2. Entitlement Redemption API

### 2.1 `POST /api/v2/spp/Entitlement/{code}/$redeem`

**Purpose:** Record a field redemption against an approved entitlement.

The `{code}` path parameter is the entitlement's UUID (`code` field on `spp.entitlement` or `spp.entitlement.inkind`).

**Request body:**

```json
{
  "receiptNumber": "RCP-20240315-A1B2C3D4-0042",
  "redemptionType": "quantity",
  "quantity": 5,
  "amount": null,
  "distributionPointName": "Warehouse A",
  "timestamp": "2024-03-15T10:30:00.000Z",
  "userId": "field-worker-001",
  "notes": "Beneficiary collected 5 bags of rice"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `receiptNumber` | string | Yes | Device-generated receipt number. Format: `RCP-{YYYYMMDD}-{8CHAR}-{4DIGIT}` for offline devices, `RCP-{YYYYMMDD}-S-{6DIGIT}` for server. Used as idempotency key. |
| `redemptionType` | `"quantity"` or `"monetary"` | Yes | Whether this is an in-kind (quantity) or cash (monetary) redemption. |
| `quantity` | number | Conditional | Required when `redemptionType` is `"quantity"`. Number of items being distributed. |
| `amount` | number | Conditional | Required when `redemptionType` is `"monetary"`. Cash amount being disbursed. |
| `distributionPointName` | string | No | Name of the service/distribution point where the redemption occurred. |
| `timestamp` | string (ISO 8601) | Yes | When the redemption occurred in the field. May be hours or days before sync if the device was offline. |
| `userId` | string | Yes | Identifier of the field worker performing the redemption. |
| `notes` | string | No | Free-text notes about the redemption. |

**Expected behavior:**

1. Validate that the entitlement identified by `{code}` exists.
2. Validate the entitlement is in `approved` state.
3. Validate the entitlement has not expired (`valid_from` <= now <= `valid_until`).
4. Validate that the remaining balance is sufficient:
   - For cash (`spp.entitlement`): `initial_amount - sum(related paid payments) >= amount`
   - For in-kind (`spp.entitlement.inkind`): `quantity - sum(related distributed quantity) >= requested quantity`
5. Create the appropriate record:
   - For cash: create an `spp.payment` record with status `paid`, linking it to the entitlement and storing the `receiptNumber`.
   - For in-kind: create a stock move or equivalent distribution record, linking it to the entitlement and storing the `receiptNumber`.
6. Return the updated remaining balance.

**Idempotency:** The `receiptNumber` serves as an idempotency key. If a request arrives with a `receiptNumber` that has already been processed, the endpoint must return the original successful result without creating a duplicate record. This is critical because DataCollect may retry sync operations after network failures.

**Success response (200):**

```json
{
  "success": true,
  "remaining": 15
}
```

**Error responses:**

| HTTP Status | `code` | When |
|---|---|---|
| 404 | `ENTITLEMENT_NOT_FOUND` | Entitlement with given `{code}` does not exist |
| 409 | `INVALID_STATE` | Entitlement is not in `approved` state |
| 409 | `ENTITLEMENT_EXPIRED` | Current date is outside the `valid_from`/`valid_until` window |
| 409 | `INSUFFICIENT_BALANCE` | Remaining balance is less than the requested amount/quantity |
| 422 | `VALIDATION_ERROR` | Missing required fields or type mismatch |

```json
{
  "error": "Insufficient entitlement balance",
  "code": "INSUFFICIENT_BALANCE"
}
```

---

### 2.2 `POST /api/v2/spp/Entitlement/{code}/$void`

**Purpose:** Void a previously recorded redemption. This is a supervisor-verified action in DataCollect (requires PIN entry).

**Request body:**

```json
{
  "originalReceiptNumber": "RCP-20240315-A1B2C3D4-0042",
  "reason": "Wrong beneficiary identified",
  "supervisorId": "supervisor-001",
  "timestamp": "2024-03-15T11:00:00.000Z",
  "userId": "field-worker-001"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `originalReceiptNumber` | string | Yes | The receipt number of the redemption to void. |
| `reason` | string | Yes | Explanation for why the redemption is being voided. |
| `supervisorId` | string | Yes | Identifier of the supervisor who authorized the void. |
| `timestamp` | string (ISO 8601) | Yes | When the void was authorized in the field. |
| `userId` | string | Yes | Identifier of the field worker who initiated the void. |

**Expected behavior:**

1. Find the payment or distribution record linked to `originalReceiptNumber`.
2. Validate it exists and has not already been voided.
3. Reverse the transaction:
   - For cash: create a counter-payment (reversal) or mark the original payment as voided.
   - For in-kind: create a reverse stock move or equivalent reversal record.
4. Update the entitlement's effective balance (the remaining amount should increase).
5. Record the void reason, supervisor ID, and timestamps for audit purposes.

**Idempotency:** If a void request for the same `originalReceiptNumber` has already been processed, return the original result.

**Success response (200):**

```json
{
  "success": true,
  "remaining": 20
}
```

**Error responses:**

| HTTP Status | `code` | When |
|---|---|---|
| 404 | `REDEMPTION_NOT_FOUND` | No payment/distribution found for the given receipt number. Note: DataCollect's `voidRedemptionApplier` throws `REDEMPTION_NOT_FOUND` (not `RECEIPT_NOT_FOUND`), so the OpenSPP endpoint should use the same code for consistency. |
| 409 | `ALREADY_VOIDED` | The redemption has already been voided |

---

### 2.3 `GET /api/v2/spp/Entitlement` -- Extended Filtering

**Enhancement:** Add a `servicePoint` query parameter to the existing entitlement listing endpoint.

```
GET /api/v2/spp/Entitlement?state=approved&servicePoint={name}
```

| Parameter | Type | Description |
|---|---|---|
| `state` | string | Filter by entitlement state (e.g., `approved`) |
| `servicePoint` | string | Filter entitlements by their assigned distribution/service point |

**Why this is needed:** DataCollect's offline redemption mode works by binding a device to a specific distribution point. When the device syncs, it pulls only the entitlements assigned to that distribution point. This enables pre-allocation: the device downloads a manageable subset of entitlements before going offline, rather than the entire program's entitlement list.

For in-kind entitlements (`spp.entitlement.inkind`), filtering by `service_point_id.name` should work with the existing model. For cash entitlements (`spp.entitlement`), this requires the model change described in Section 5.1 (adding `service_point_id` to the cash entitlement model).

---

### 2.4 `GET /api/v2/spp/ServicePoint`

**Purpose:** List available service/distribution points.

**Response (200):**

```json
[
  {
    "name": "warehouse-north-01",
    "display": "North District Warehouse",
    "area": "North District",
    "address": "123 Main Road, North District",
    "isContractActive": true
  },
  {
    "name": "mobile-unit-05",
    "display": "Mobile Distribution Unit 5",
    "area": "Rural Zone B",
    "address": "",
    "isContractActive": true
  }
]
```

| Field | Type | Description |
|---|---|---|
| `name` | string | Unique identifier / technical name of the service point |
| `display` | string | Human-readable display name |
| `area` | string | Geographic area or district |
| `address` | string | Physical address (may be empty for mobile units) |
| `isContractActive` | boolean | Whether the service point is currently active |

**Usage:** DataCollect displays this list in the "Select Distribution Point" dropdown during the offline redemption setup flow (`DistributionPointSetupView.vue`). The selected `name` value is stored as `distributionPointId` and used for entitlement filtering (Section 2.3) and reporting.

---

### 2.5 Entitlement Response Schema Enhancement

Add the following computed fields to the entitlement API response (both cash and in-kind):

| Field | Type | Source (Cash `spp.entitlement`) | Source (In-Kind `spp.entitlement.inkind`) |
|---|---|---|---|
| `redeemed_amount` | number | Sum of related `spp.payment` amounts where status = `paid`, minus voided amounts | N/A or 0 |
| `redeemed_quantity` | number | N/A or 0 | Derived from stock moves / distribution records, minus reversals |
| `remaining` | number | `initial_amount - redeemed_amount` | `quantity - redeemed_quantity` |

**Why this is needed:** When DataCollect syncs (pulls entitlements), it needs to know the current balance for each entitlement. The `grant-entitlement` event applier uses these values to reconcile server state with any local (unsynced) offline redemptions. Specifically:

1. Server sends entitlements with `redeemed` values reflecting all server-processed redemptions.
2. DataCollect overlays any local unsynced redemption deltas on top of the server value.
3. This prevents double-counting when offline redemptions are eventually synced.

If these fields are missing from the API response, DataCollect cannot accurately display remaining balances or prevent over-redemption after a sync.

---

## 3. Entitlement Field Mapping

This table maps DataCollect's entitlement fields to their OpenSPP model counterparts. DataCollect's sync adapter will use this mapping to transform API responses into local `grant-entitlement` events.

| DataCollect Field | Cash (`spp.entitlement`) | In-Kind (`spp.entitlement.inkind`) |
|---|---|---|
| `id` | `code` (UUID) | `code` (UUID) |
| `programId` | via `cycle_id.program_id` | via `cycle_id.program_id` |
| `programName` | `program_id.name` | `program_id.name` |
| `type` | `"monetary"` (constant) | `"quantity"` (constant) |
| `itemName` | N/A | `product_id.name` |
| `currency` | `currency_id.name` | `currency_id.name` |
| `allocated` | `initial_amount` | `quantity` |
| `redeemed` | Derived from payments (Section 2.5) | Derived from stock moves (Section 2.5) |
| `distributionPointGuid` | N/A (needs model change, Section 5.1) | `service_point_id.name` |
| `validFrom` | `valid_from` | `valid_from` |
| `validUntil` | `valid_until` | `valid_until` |
| `unitPrice` | N/A | `unit_price` |
| `totalValue` | `initial_amount` | `total_amount` |
| `unitOfMeasure` | N/A | `uom_id.name` |
| `productCode` | N/A | `product_id.default_code` |

**Note:** The `id` field is the entitlement's `code` (UUID), which is also the `{code}` path parameter used in the `$redeem` and `$void` endpoints. This is not the Odoo database `id` (integer).

---

## 4. Attendance API

### 4.1 Module: `spp_attendance`

A standalone Odoo module for attendance management.

**Models:**

#### `spp.attendance.session`

| Field | Type | Description |
|---|---|---|
| `name` | Char | Session display name |
| `session_id` | Char (unique) | UUID generated by DataCollect |
| `date` | Date | Session date |
| `program_id` | Many2one (`g2p.program`) | Associated program (optional) |
| `cycle_id` | Many2one (`g2p.cycle`) | Associated cycle (optional) |
| `group_id` | Many2one (`res.partner`, domain `[('is_group','=',True)]`) | Group/class being tracked |
| `state` | Selection: `draft`, `open`, `closed` | Session lifecycle state |
| `external_code` | Char (unique, indexed) | DataCollect session GUID (for idempotent sync) |
| `record_ids` | One2many (`spp.attendance.record`) | Attendance records in this session |
| `user_id` | Many2one (`res.users`) | User who created/owns the session |

#### `spp.attendance.record`

| Field | Type | Description |
|---|---|---|
| `session_id` | Many2one (`spp.attendance.session`) | Parent session |
| `partner_id` | Many2one (`res.partner`, domain `[('is_registrant','=',True)]`) | Individual being tracked |
| `status` | Selection: `present`, `absent`, `excused`, `late` | Attendance status |
| `timestamp` | Datetime | When the status was recorded |
| `external_code` | Char (unique, indexed) | DataCollect form GUID (for idempotent sync) |

**Views:**

- Session list view with columns: name, date, program, group, state, record count
- Session form view with inline attendance sheet (editable tree of records)
- Registrant form: add an "Attendance" tab showing attendance history for the individual (filtered `spp.attendance.record` records)

**Notes on DataCollect's attendance data model:**

DataCollect stores attendance per-individual (each individual entity has an `attendance` object with a `sessions` array). The attendance event applier (`AttendanceEventApplier`) expects form submissions with these fields:

```typescript
{
  sessionId: string,      // UUID
  sessionName: string,    // Human-readable session name
  mode: "check-in" | "roll-call",  // How attendance was captured (informational)
  groupGuid: string,      // Optional - group the session belongs to
  programId: string,      // Optional - program identifier
  date: string,           // ISO date (YYYY-MM-DD)
  status: "present" | "absent" | "excused" | "late"
}
```

> **Note on `mode`:** The `mode` field indicates how the attendance was captured on the mobile device. `"check-in"` means individuals were scanned/tapped in one-by-one; `"roll-call"` means a group roster was displayed and statuses were set in bulk. This field is included in the form submission data but is not used by the `AttendanceEventApplier` for state derivation — it is informational metadata that OpenSPP may store for reporting or audit purposes.

The sync adapter will need to map between DataCollect's per-individual event model and OpenSPP's session-based model.

---

### 4.2 Module: `spp_api_v2_attendance`

API endpoints for attendance synchronization.

#### `GET /api/v2/spp/AttendanceSession`

**Purpose:** List attendance sessions with optional filters.

| Parameter | Type | Description |
|---|---|---|
| `date` | string (ISO date) | Filter by session date |
| `program_id` | integer | Filter by program |
| `group_id` | integer | Filter by group |
| `state` | string | Filter by state (`draft`, `open`, `closed`) |

**Response (200):**

```json
[
  {
    "id": 1,
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Morning Training Session",
    "date": "2024-03-15",
    "program_id": 5,
    "group_id": 42,
    "state": "open",
    "external_code": "dc-session-guid-here",
    "record_count": 25
  }
]
```

#### `POST /api/v2/spp/AttendanceSession`

**Purpose:** Create a new attendance session.

**Request body:**

```json
{
  "name": "Morning Training Session",
  "date": "2024-03-15",
  "program_id": 5,
  "group_id": 42,
  "external_code": "dc-session-guid-here"
}
```

**Idempotency:** If `external_code` already exists, return the existing session without creating a duplicate.

**Response (201 or 200 if already exists):**

```json
{
  "id": 1,
  "session_id": "generated-uuid",
  "external_code": "dc-session-guid-here",
  "state": "draft"
}
```

#### `POST /api/v2/spp/AttendanceSession/{id}/$record`

**Purpose:** Batch-submit attendance records for a session.

**Request body:**

```json
{
  "records": [
    {
      "partnerId": 101,
      "status": "present",
      "timestamp": "2024-03-15T09:05:00.000Z",
      "externalCode": "dc-form-guid-001"
    },
    {
      "partnerId": 102,
      "status": "absent",
      "timestamp": "2024-03-15T09:05:00.000Z",
      "externalCode": "dc-form-guid-002"
    },
    {
      "partnerId": 103,
      "status": "late",
      "timestamp": "2024-03-15T09:15:00.000Z",
      "externalCode": "dc-form-guid-003"
    }
  ]
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `partnerId` | integer | Yes | OpenSPP partner ID of the individual |
| `status` | `"present"`, `"absent"`, `"excused"`, `"late"` | Yes | Attendance status |
| `timestamp` | string (ISO 8601) | Yes | When the status was recorded on the device |
| `externalCode` | string | Yes | DataCollect form GUID. Used as idempotency key. |

**Expected behavior:**

1. Validate the session exists and is in `draft` or `open` state.
2. For each record:
   - If `externalCode` already exists in the session's records, skip it (idempotent).
   - Otherwise, create a new `spp.attendance.record`.
3. Return a summary of the results.

**Response (200):**

```json
{
  "success": true,
  "created": 2,
  "skipped": 1,
  "total": 3
}
```

---

## 5. Model Changes Required

### 5.1 Optional: Cash Entitlement Pre-Allocation to Service Points

**Model:** `spp.entitlement`

**Change:** Add `service_point_id` field (Many2one to `spp.service.point`).

**Why:** The in-kind entitlement model (`spp.entitlement.inkind`) already has a `service_point_id` field, which allows DataCollect to filter entitlements by distribution point for offline pre-allocation. The cash entitlement model (`spp.entitlement`) does not have this field.

**Impact if not implemented:** Without this field:

- Offline pre-allocation will only work for in-kind entitlements.
- Cash entitlements will not appear in the filtered list when a device is bound to a distribution point.
- Cash entitlements can still be redeemed in online mode (search by beneficiary), but the offline workflow will be limited to in-kind items.

**Impact if implemented:**

- Full offline workflow support for both cash and in-kind entitlements.
- The `servicePoint` filter (Section 2.3) will work for both entitlement types.
- The distribution point setup flow in DataCollect will pull both cash and in-kind entitlements.

**Priority:** P2 (nice to have). The core redemption workflow works without this.

---

## 6. DataCollect Sync Adapter

Once the OpenSPP endpoints described above are available, the DataCollect team will implement a V2 sync adapter extension. This section describes the sync flows for reference, so the OpenSPP team understands the call patterns.

### 6.1 Pull Entitlements

1. Call `GET /api/v2/spp/Entitlement?state=approved&servicePoint={boundPoint}`.
2. Transform each entitlement into DataCollect format using the field mapping in Section 3.
3. Generate `grant-entitlement` events and apply them via `grantEntitlementApplier`.
4. The applier handles merge logic: server `redeemed` values are treated as truth, with local unsynced redemption deltas added on top.

### 6.2 Push Redemptions

1. For each unsynced redemption in the entity's `redemptionHistory`:
   - If `type === "redemption"`: call `POST /api/v2/spp/Entitlement/{id}/$redeem`
   - If `type === "void"`: call `POST /api/v2/spp/Entitlement/{id}/$void`
2. Mark each history entry as `synced: true` after successful push.
3. Idempotency on the OpenSPP side ensures retries are safe.

### 6.3 Pull Service Points

1. Call `GET /api/v2/spp/ServicePoint`.
2. Store the result as reference data in the app config's `entityData.servicePoints` array.
3. Used by `DistributionPointSetupView.vue` to populate the dropdown.

### 6.4 Push Attendance

1. For each unsynced attendance session:
   - Call `POST /api/v2/spp/AttendanceSession` with the session metadata and `external_code`.
   - Call `POST /api/v2/spp/AttendanceSession/{id}/$record` with the batch of individual records.
2. The `externalCode` on each record ensures idempotent replay.

---

## 7. Priority Order

| Priority | Sections | Feature | Rationale |
|---|---|---|---|
| **P0** | 2.1, 2.2, 2.3, 2.4, 2.5 | Entitlement redemption API | Required for the offline redemption workflow to sync with OpenSPP. Without these endpoints, redemptions recorded on mobile devices cannot be reflected in the central system. |
| **P1** | 4.1, 4.2 | Attendance models and API | Required for attendance data collected on mobile devices to sync with OpenSPP. Lower priority because attendance data is less time-sensitive than financial redemption records. |
| **P2** | 5.1 | Cash pre-allocation | Nice to have. Enables offline pre-allocation for cash entitlements. The core redemption workflow functions without this change. |

---

## 8. Testing Expectations

### 8.1 Unit Tests

Each endpoint must have unit tests covering:

- Successful redemption (cash and in-kind)
- Successful void
- Idempotency: same `receiptNumber` submitted twice results in only one payment/distribution
- Idempotency: same `externalCode` submitted twice results in only one attendance record
- Validation errors: missing fields, invalid state, expired entitlement, insufficient balance
- Edge cases: zero-amount redemption, void of a void (should fail), redemption at exact boundary of remaining balance

### 8.2 Integration Tests

**Redemption round-trip:**

1. Create a program with a cycle and approved entitlements in OpenSPP.
2. DataCollect pulls entitlements via `GET /api/v2/spp/Entitlement?state=approved`.
3. DataCollect records a redemption offline, generating a receipt number.
4. DataCollect syncs: pushes the redemption via `POST /api/v2/spp/Entitlement/{code}/$redeem`.
5. DataCollect pulls updated entitlements again.
6. Verify: the `remaining` balance reflects the redemption.
7. Verify: the same receipt number submitted again does not create a duplicate.

**Attendance round-trip:**

1. Create a group with individuals in OpenSPP.
2. DataCollect records attendance for the group.
3. DataCollect syncs: creates a session and submits records.
4. Verify: OpenSPP has the session with correct statuses.
5. Verify: same `externalCode` submitted again is skipped.

### 8.3 Idempotency Stress Test

Submit the same redemption request 10 times concurrently (simulating retry storms after network instability). Verify that exactly one payment record is created and all 10 responses return the same result.

---

## Appendix A: Receipt Number Format

DataCollect generates receipt numbers in two formats:

**Offline (device-generated):**
```
RCP-{YYYYMMDD}-{8-CHAR-DEVICE-ID}-{4-DIGIT-SEQUENCE}
Example: RCP-20240315-A1B2C3D4-0042
```

- The device ID is a truncated UUID assigned per device.
- The sequence resets daily and is zero-padded to 4 digits.
- Gaps in the sequence are expected (e.g., if a redemption is abandoned after the receipt number is generated).

**Server-generated:**
```
RCP-{YYYYMMDD}-S-{6-DIGIT-SEQUENCE}
Example: RCP-20240315-S-000042
```

- The `S` prefix distinguishes server-generated receipts from offline ones.
- Server sequence is padded to 6 digits to accommodate higher volumes.

OpenSPP should store the `receiptNumber` as a unique indexed string field on the payment/distribution record.

## Appendix B: DataCollect Event Types Reference

| Event Type | Description | Registered Via |
|---|---|---|
| `record-attendance` | Record one individual's attendance status for a session | `AttendanceEventApplier` |
| `grant-entitlement` | Merge server-sent entitlements into an entity (pull sync) | `RedemptionEventApplier` |
| `redeem-entitlement` | Record a redemption against an entitlement (offline or online) | `RedemptionEventApplier` |
| `void-redemption` | Void a previously recorded redemption (supervisor-verified) | `RedemptionEventApplier` |

These are registered in the backend via `customEventTypes` in the app config JSON and activated by `registerAppEventAppliers()` in `AppInstanceStore`.

## Appendix C: DataCollect Attendance Status Values

| Status | Meaning |
|---|---|
| `present` | Individual was present and on time |
| `absent` | Individual did not attend |
| `excused` | Individual was absent with a valid reason |
| `late` | Individual attended but arrived late (counted as "attended" in aggregate stats) |

OpenSPP's `spp.attendance.record.status` selection field must use these exact string values to maintain compatibility.
