---
id: mobile-app
title: Mobile App User Guide
sidebar_position: 3
---

# Mobile App User Guide

The ID PASS DataCollect mobile app is built for offline-first data collection in the field. It runs as a native Android or iOS app, and also in a browser for development and demos — a few features are native-only and are marked as such below.

## 1. Overview

The app lets you:

- Load **collection programs** (configurations) provided by your administrator
- Collect data with forms, with or without a connection
- Store records on the device
- Sync records to the central server when you are online and choose to

Screens use "program" throughout. Older documentation may call the same thing an "app".

## 2. Loading a Collection Program

The home screen is titled **Collection Programs**. It lists the programs on your device with, per card, the number of synced and pending records, the form count, and the version. A strip above the list summarises all programs together: **N synced**, **N pending**, **N total**.

To add a program, tap **Add Program** (or the **+** button, or **Add your first program** when the list is empty). A sheet titled **Add Program** offers three options:

| Option | What it does |
|--------|--------------|
| **Scan QR Code** | Scans the deployment QR from the admin UI. Native app only — this row does not appear in a browser. |
| **Enter URL** | Loads a configuration from a download URL. Only `https:` URLs are accepted (debug builds also allow `http:`). |
| **Import JSON File** | Picks an exported configuration file from the device. |

The configuration is checked for an `id`, a `name`, and an `entityForms` list, and its version must be **strictly newer** than a program already installed under the same ID or name — re-importing the same file is refused with a message naming both versions.

:::note What is not validated
Only the presence of those top-level fields and the version ordering are checked. Form definitions themselves are not validated on import, so a malformed form surfaces when you open it, not when you load the program.
:::

## 3. Signing In

Opening a program requires authentication. Tapping a program card when you are not signed in takes you to that program's login screen, which asks you to choose an authentication method: email address and password, or one of the **Sign in with PROVIDER** buttons if the program configures an external provider (Auth0, Keycloak).

:::info Login gates the whole program, not just sync
You cannot collect data locally first and log in later — the program screen does not open until you have authenticated. The one exception is Claim-169 identity verification (see below), which works without signing in.
:::

## 4. The Program Screen

Tapping a program opens its record list. The screen shows:

- A header with the program name, version, and a status chip: **Offline mode**, **Syncing…**, **Synced**, or **Pending sync**
- Three tiles: **Synced** (records available), **Pending** (waiting to sync), **Records** (collected so far)
- A search box — "Search by name, ID, village…" — which matches the display name and falls back to any value in the record
- Filter chips, one per form that has records, plus **All**; shown only when there is more than one
- A **Sync** button (top left) and **Logout** (top right)
- A **+** button, bottom right, to start a new record

Below that is the list of **records you have already collected** — not a list of forms. Each row shows the record's display name, its form, when it was updated, and a status chip. Tapping a row opens the record.

When there are no records yet, the screen reads "No records yet — Tap + to start collecting."

## 5. Collecting Data

1. On the program screen, tap **+**.
2. A sheet titled **New entry** lists the program's **top-level** forms. Tap one.
3. Fill in the fields and submit the form.

Your record is saved on the device immediately and is available offline.

:::note Dependent forms are entered from their parent
The **New entry** sheet lists only top-level forms. A form that depends on another (household members, for example) is started from inside its parent record, under **Dependent Forms**.
:::

## 6. Viewing a Record

Opening a record shows a header card with its name, an **Updated** timestamp, a **Version** chip, and — for records verified from a credential — a **Verified by ISSUER** chip. Two icon buttons sit alongside: a pencil to edit, and an eye to open a **View Entity** dialog.

The rest of the page holds:

- **Dependent Forms** — related forms you can start or browse from this record
- **Program Enrollment** — see below, when applicable
- **Events** — the record's change history, each entry showing the event type, timestamp, a sync status chip, and the event data

:::note Full form data is raw JSON
The header card does not list the record's fields. The **View Entity** dialog shows the current record state as raw JSON, without field labels; the same is true of the event data in **Events**. To see the data laid out as a form, open the record for editing.
:::

### Program Enrollment

For individual records in programs that declare OpenSPP programs, a **Program Enrollment** card lists enrolment status per program: **Enrolled**, **Pending sync**, or **Rejected** (with the rejection reason). **Enroll in Program** opens a picker of the programs still available.

Enrolment is recorded as a local event, so it reaches the external system only after a successful sync. A rejected enrolment can be attempted again — the program returns to the selectable list.

## 7. Synchronization

All data is stored locally first. Sync then happens in these situations, and only these:

1. **When you open a program** and the device is online.
2. **When connectivity returns** while that program's screen is open and records are still pending.
3. **When you tap Sync** on the program screen.

:::warning Sync is not continuous
There is no background or interval-based sync. Sitting on the home screen, or leaving the app in the background, does not sync anything — and neither does regaining connectivity while you are not on the program's screen. When it matters that records have reached the server, open the program and tap **Sync**.
:::

The **Sync** button is disabled while you are offline; tapping it then reports "Sync requires an online connection." Conflicts between your device and the server are resolved automatically using version numbers.

### Sync status labels

| Label | Meaning |
|-------|---------|
| **Local** | Recorded on this device only |
| **Synced** | Reached the central server |
| **Pending** / **Pending sync** | Waiting to be sent |
| **Draft** | Started but not submitted |

:::note Externally-synced data is not shown separately
Records that have also reached an external system such as OpenSPP show the same **Synced** indicator as records that have only reached the DataCollect server. The app does not currently distinguish the two.
:::

A **Scope:** chip next to the status chip shows how much of the program's data this device receives — for example `Scope: Unbounded`, or a narrower scope set by your administrator.

## 8. Data Transformation

Programs that map fields to an external system (such as OpenSPP) convert values in both directions: dates between formats, IDs for relation fields, arrays to and from delimited strings, and checkbox values to the external system's booleans.

:::note Where the reverse conversion applies
Data pulled from an external system is converted back to form format **when you open a record for editing**, so the edit form is pre-filled with values you recognise. The **View Entity** dialog shows the stored data as-is, without that conversion.
:::

## 9. Claim-169 Identity Verification

The **Tools** tab holds **Claim-169 Verification**, which scans an identity QR code and verifies its signature **fully offline** against the trusted issuers in the program configuration — no network call at scan time.

From **Tools → Claim-169 → Scan Identity QR** you can review the decoded **Identity Details** (personal, contact, guardian, and credential information, plus the raw data) and **Save to Records**, choosing which program to save the identity into. This flow works without signing in.

Inside a program whose configuration enables Claim-169, a QR icon next to the search box scans a credential to verify an identity and jump straight to that person's record. A QR that fails signature verification is refused rather than acted on.

Records created or matched this way carry a **Verified by ISSUER** chip; tapping it shows the issuer DID, subject ID, scan time, and credential validity dates.

## 10. App Lock

On native devices the app locks itself on launch, when it is sent to the background, and after five minutes of inactivity. The lock screen asks you to **Unlock** using biometrics or your device credential — the app has no PIN of its own. A device with neither biometrics nor a screen lock cannot unlock the app. The lock does not apply to the browser preview.

## 11. Settings

The **Settings** tab reports the app version and network state, and a **Sync Queue** section showing sync status, pending event count, total entities, last sync time, and the last error if there was one — with actions to copy the error or re-login.
