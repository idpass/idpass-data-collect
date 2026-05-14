# DCI Friday Demo — UC3 widow enrolment

**Date:** 2026-05-15
**Branch:** `demo/dci-friday`
**OpenProject:** OP #985 (UC3 widow enrolment) — driven by demo branch, not the full UC3 plan.

This runbook gets a demo presenter from a cold machine to a working
"household → assign_program CR → OpenSPP approves → membership applied" walk
without ad-hoc clicks. Read once end-to-end before the demo; keep
the live-test verification step until you're satisfied.

---

## Scenario being demonstrated

A DataCollect field agent works offline in **Farajaland, North**, intakes the
**Adeyemi Household** with widow Funke Adeyemi + two dependents, taps **Enrol
in Program → Widow Disability Support**, then syncs when back online. The
adapter pushes the household + members to OpenSPP via the V2 API, then
submits one `assign_program` ChangeRequest. An OpenSPP operator approves +
applies the CR; OpenSPP runs eligibility (PMT, disability checks)
transparently downstream and the next mobile pull surfaces the transition.

**DataCollect's responsibility**: offline-capable identity intake
(household + widow + dependents), optional Claim-169 identity verification,
program-enrolment intent capture, and sync.

**OpenSPP's responsibility (transparent to DataCollect)**:
disability-registry queries, PMT / Social Registry poverty checks,
eligibility decision, membership lifecycle.

What is **in scope** for Friday:
- Mobile offline-first capture of household + widow + dependents
- Mobile UI: button to select a program and enrol the household
- Adapter: `enrol-in-program` event → `/ChangeRequest` with `requestType.code=assign_program`
- OpenSPP: existing approval workflow (`spp_cr_type_assign_program`)
- Idempotency: re-syncing the same enrolment is a no-op

What is **out of scope**:
- **Disability fields, PMT inputs, school enrolment**: OpenSPP owns these and queries them transparently. The widow form intentionally does not duplicate them.
- **Claim-169 VC scanner wiring**: the form carries an optional verification panel placeholder. Live MOSIP-VC integration is post-demo (UC3 Phase 4 of the full plan).
- **DCI birth-verification flow**: different OpenSPP module (`spp_dci_demo`), not used here.
- **Eligibility decision**: OpenSPP's job after `$apply`.

---

## Prerequisites

### OpenSPP

| Item | Detail |
|------|--------|
| Modules | `spp_api_v2`, `spp_api_v2_change_request`, `spp_cr_type_assign_program`, `spp_programs` (and dependencies). `spp_demo` for the bundled demo data is optional. |
| Approval workflow | The `assign_program` CR type needs an approval definition. Without one, `$submit` returns 400 ("No approval workflow configured for request type 'Assign to Program'"). Configure once via Registry → Configuration → Change Requests → CR Types. |
| FastAPI endpoint user | Must be `admin` (or any user with `Change Request: Read/Write` + `CR Requestor` groups). The default `public` user is blocked from `spp.change.request.type` records and the CR create returns 500. `scripts/seed-uc3.sh` patches this automatically. |
| API V2 client | Scopes required: `change_request:all`, `group:all`, `individual:all`, `identifier:all`. Create via Registry → Configuration → API V2 → API Clients. Note the `client_id` + `client_secret`. |
| Program | A `spp.program` record named **"Widow Disability Support"** with `target_type=group` and `state=active`. `scripts/seed-uc3.sh` creates one if not present. |

### DataCollect

| Item | Detail |
|------|--------|
| Branch | `demo/dci-friday` (3 demo commits on top of #948 CR work) |
| Backend | Postgres + Express, default port 3000 |
| Admin UI | Vite dev or built, default 5173 |
| Mobile | PWA at `/mobile/`, or APK from `pnpm --filter @idpass/data-collect-mobile build:android:apk` |

---

## Cold-start sequence (run in this order)

### 1. OpenSPP up

```bash
cd /var/home/pmigueld/Work/Code/public/openspp/OpenSPP2
git checkout 19.0 && git pull --ff-only origin 19.0
ODOO_INIT_MODULES="spp_base,spp_api_v2,spp_api_v2_change_request,spp_cr_type_assign_program,spp_programs,spp_demo" \
  podman compose --profile ui up -d --build
```

Wait for `curl -fsS http://localhost:8069/web/health` → `{"status": "pass"}`.

If `spp_cr_type_assign_program` shows as `uninstalled` (some init orders
miss it), install via the UI: Apps → search `spp_cr_type_assign_program`
→ Install.

### 2. Configure OpenSPP approval workflow for `assign_program`

In OpenSPP UI: Registry → Configuration → Change Requests → CR Types → open
"Assign to Program" → **Approval Definition** tab. Either add a single-step
approval pointing at the admin user, or import an existing manual-approval
definition. Save.

> Without this step, `$submit` will keep the CR in `draft` forever and the
> mobile chip never clears. The adapter will not retry — it persists `draft`
> on first push and only re-submits on the next push.

### 3. Create the API V2 client + grant scopes

UI: Registry → Configuration → API V2 → API Clients → **New**. Name:
`datacollect-uc3-demo`. Save. Click "Regenerate Secret" and **copy both
`Client ID` and `Client Secret`** into a scratch buffer. Open the **Scopes**
tab and add four rows: `change_request:all`, `group:all`, `individual:all`,
`identifier:all`. Save.

### 4. DataCollect backend up + seed UC3 tenant

```bash
cd /var/home/pmigueld/Work/Code/public/idpass/idpass-datacollect
pnpm install
pnpm --filter @idpass/data-collect-backend dev   # or `pnpm dev` from repo root
```

In another shell:

```bash
export OPENSPP_URL=http://localhost:8069
export OPENSPP_CLIENT_ID=client_c0VcAHUNJvqxPFUy6xYkcA   # ← from step 3
export OPENSPP_CLIENT_SECRET=...                          # ← from step 3
./scripts/seed-uc3.sh
```

The script:
1. Authenticates against OpenSPP, finds or creates the **Widow Disability Support** program, captures its primary key.
2. Sets the FastAPI endpoint user to `admin` if it isn't already.
3. Substitutes `${OPENSPP_URL}`, `${OPENSPP_CLIENT_ID}`, `${OPENSPP_CLIENT_SECRET}`, `${OPENSPP_PROGRAM_ID}` into `scripts/seed-config-uc3-widow.json`.
4. Uploads the rewritten tenant config to `/api/apps`.
5. Ensures the `fieldworker@datacollect.lan` user has the new tenant assigned.

Re-runnable. Existing tenant + program get reused.

### 5. Live wire-check (recommended before showtime)

```bash
cd packages/adapter-openspp
LOCAL_OPENSPP_URL=$OPENSPP_URL \
LOCAL_OPENSPP_CLIENT_ID=$OPENSPP_CLIENT_ID \
LOCAL_OPENSPP_CLIENT_SECRET=$OPENSPP_CLIENT_SECRET \
LOCAL_OPENSPP_PROGRAM_ID=$(podman exec openspp2-db-1 psql -U odoo -d openspp -t -c "SELECT id FROM spp_program WHERE name='Widow Disability Support' LIMIT 1;" | xargs) \
pnpm exec jest --testPathIgnorePatterns='/node_modules/' \
  --testPathPattern='OpenSppV2SyncAdapter.uc3.integration' --verbose
```

Expected: 2 tests pass. The first creates a fresh household on OpenSPP +
submits one `assign_program` CR; the second confirms idempotency.

Verify on OpenSPP-side:

```bash
podman exec openspp2-db-1 psql -U odoo -d openspp -c \
  "SELECT name, approval_state FROM spp_change_request \
   WHERE request_type_id IN (SELECT id FROM spp_change_request_type \
     WHERE code='assign_program') ORDER BY id DESC LIMIT 5;"
```

You should see at least one fresh `CR/2026/0000X` row.

### 6. Mobile up

```bash
pnpm --filter @idpass/data-collect-mobile dev   # http://localhost:8081
```

Log in as `fieldworker@datacollect.lan / fieldworker123`. The UC3 tenant
("UC3 Widow Enrolment (Farajaland)") should appear in the tenant list.

---

## Live demo walkthrough

The flow has three beats: **offline capture → enrol → sync round-trip**.

### Beat 1 — Offline capture (proves the "data collect" half)

1. **Open the UC3 tenant** on mobile. Show the pre-seeded Adeyemi Household
   in the household list to anchor the audience.
2. **Toggle airplane mode** (or otherwise drop network).
3. **Create a fresh household**: tap **+ New** → household form. Enter
   "Okonkwo Household", area "Farajaland — North", an address. Save.
4. **Add the widow**: from the new household, tap the **widow** form
   (it's a dependent form). Enter "Amaka Okonkwo", DOB, national ID.
   Leave the *Identity Verification* panel collapsed (Claim-169 is
   post-demo). Save.
5. **Add a dependent**: same household → dependent form → "Chidi Okonkwo",
   relationship "child". Save.
6. *Optional aside:* open IndexedDB devtools to show events queued locally.
   The mobile UI also shows a sync indicator with the local-event count.

### Beat 2 — Enrol in program (the new piece this PR ships)

7. Open the new household's detail card. Below the title you'll see a
   **Programs** section with an **"Enrol in Program"** button (visible
   because the entity is a group and the tenant config carries `programs[]`).
8. Tap → select **"Widow Disability Support"**.
9. A pending chip appears under the household: *"Widow Disability Support ·
   pending"*. The mobile event store now has one `enrol-in-program` event
   referencing this household + the program id.

### Beat 3 — Sync round-trip (proves the OpenSPP integration)

10. **Toggle airplane mode off**. Trigger sync (the sync button on the
    home screen, or wait for the scheduled push).
11. On sync, the adapter:
    - POSTs `/Group` + `/Individual` for the new offline-captured records.
    - POSTs `/ChangeRequest` with `requestType.code=assign_program` and
      `detail.program_id=<X>` for the household.
12. Switch to OpenSPP UI: Registry → Change Requests. Find the new draft
    CR for Okonkwo. Click **Submit → Approve → Apply**. OpenSPP runs its
    own eligibility logic at apply time (disability registry, PMT, etc.) —
    that's transparent to the audience and to DataCollect.
13. Back on mobile: trigger another sync. The CR poll picks up the
    transition; the chip's record updates to `applied` (the UI keeps the
    chip advisory until the next entity pull surfaces the membership).
14. Confirm on OpenSPP: Registry → Programs → Widow Disability Support →
    Members. The Okonkwo Household appears in `draft` membership state per
    the `spp_cr_type_assign_program` apply strategy. A Program Manager
    activates the membership in production — out of scope for the demo.

---

## What can go wrong (cheat sheet)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Mobile "Enrol in Program" button absent | Tenant config missing `programs[]`; entityType not `group`; or mobile DB on schema v0 | Re-run `seed-uc3.sh`; uninstall + reinstall mobile (RxDB v0 → v1 migration only fires on a fresh open) |
| Push 401 from OpenSPP | API client secret expired / regenerated since seed | Regenerate, update env, re-run `seed-uc3.sh` |
| Push 403 on `/ChangeRequest` | FastAPI endpoint user is `public` | `seed-uc3.sh` patches this; verify Registry → Settings → API V2 endpoint user is `admin` |
| `Registrant not found: …` from OpenSPP | Adapter sent registrant `system` with `#code` fragment | Should not happen — adapter now strips the fragment in CR mode. If reproduced, file a bug; double-check `OpenSppV2SyncAdapter.ts::pushPendingProgramEnrolments` |
| CR stays in `draft` forever | No approval workflow configured for `assign_program` | Step 2 above |
| Mobile chip never clears after operator approves | CR poll only runs on `pullData` cycle. Press sync; or wait for scheduled pull |
| Duplicate CR on re-sync | Idempotency key collision. Should not happen with `cr:{guid}:{programId}` shape — file a bug if seen |

---

## Cleanup after demo

```bash
# DataCollect side
curl -X DELETE http://localhost:3000/api/apps/uc3-widow-enrolment \
  -H "Authorization: Bearer <admin-token>"

# OpenSPP side
# Stop containers
cd /var/home/pmigueld/Work/Code/public/openspp/OpenSPP2
podman compose --profile ui down

# To fully reset (DESTRUCTIVE — wipes seeded program + CRs):
podman compose --profile ui down -v
```

---

## Acceptance criteria for the demo

- [ ] OpenSPP healthy + all four modules installed
- [ ] OpenSPP `assign_program` CR type has an approval workflow
- [ ] OpenSPP FastAPI endpoint user is `admin`
- [ ] OpenSPP API client has all four scopes
- [ ] Program "Widow Disability Support" exists with `state=active`
- [ ] `pnpm exec jest …uc3.integration… --verbose` passes (2/2)
- [ ] Mobile shows the seeded Adeyemi household with Enrol button
- [ ] **Offline mode**: agent can create household + widow + dependent and save (all events land in IndexedDB)
- [ ] Tapping Enrol → selecting program → pending chip appears
- [ ] First sync → household + members POSTed and CR appears on OpenSPP with `requestType.code=assign_program`
- [ ] Operator approves → applies → membership row created
- [ ] Second sync → poll updates the CR record to `applied`

---

## Source pointers

- Adapter mapping: `packages/adapter-openspp/src/v2/OpenSppV2AdapterOptions.ts:53-110`
- Adapter push branch: `packages/adapter-openspp/src/v2/OpenSppV2SyncAdapter.ts::pushPendingProgramEnrolments`
- CR idempotency store: `packages/adapter-openspp/src/v2/changeRequestStore.ts`
- Core applier: `packages/datacollect/src/services/EventApplierService.ts::enrolInProgram`
- Mobile UI: `packages/mobile/src/views/DetailView.vue` (computed `enrolableProgams` + `enrolInProgram`)
- Mobile config schema: `packages/mobile/src/schemas/tenantApp.schema.ts` (v0 → v1)
- Tenant seed: `scripts/seed-config-uc3-widow.json`
- Setup script: `scripts/seed-uc3.sh`
- Happy-path tests: `packages/adapter-openspp/src/__tests__/OpenSppV2SyncAdapter.uc3HappyPath.test.ts`
- Live-integration tests: `packages/adapter-openspp/src/__tests__/OpenSppV2SyncAdapter.uc3.integration.test.ts`
- UC3 full plan (post-demo): `.claude/plans/2026-04-30_uc3-widow-enrolment-intake.plan.md`
- Change-Request transport plan: `.claude/plans/2026-05-13_program-enrolment-cr.plan.md`
