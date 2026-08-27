---
id: admin-ui-dashboard
title: Admin UI Dashboard Guide
sidebar_position: 2
---

# Admin UI Dashboard Guide

This guide walks through the ID PASS DataCollect Admin UI — a web interface for creating collection programs, managing users, and monitoring collected data and sync activity.

Throughout the UI, a **collection program** is one tenant configuration: its entity forms, entity types, integration settings, and authentication. Older documentation and some API payloads call the same object an "app config".

## 1. Signing In

1. Navigate to the admin URL provided by your system administrator.
2. Enter your **Email** and **Password**.
3. Click **Sign in**.

On success you land on the dashboard.

## 2. The Dashboard (Collection Programs)

The page after sign-in is titled **Collection Programs**. It lists every program as a card, twelve per page.

### Toolbar and controls

| Control | Notes |
|---------|-------|
| Search box | Placeholder "Search programs…"; filters as you type |
| **Sort by** | Name, ID, or Entities Count |
| **Order** | Ascending or Descending |
| **Show archived** / **Hide archived** | Toggles archived programs in and out of the list |
| Refresh (icon) | Re-fetches the list |
| **New Collection Program** (+ icon) | Opens the program wizard |
| **Import JSON Configuration** (upload icon) | Creates a program from an exported config file |
| Pagination | Appears only when there is more than one page |

Above the list, a line reads "Showing N of TOTAL programs".

### Overview panel

A sidebar **Overview** card shows four figures: **Total Programs**, **Total Entities**, **Sync Enabled**, and **Local Only**.

:::note
Only **Total Programs** is a server-wide total. The other three are computed from the page of programs currently displayed, so they change as you page or filter.
:::

### Importing a configuration

Click the **Import JSON Configuration** icon, choose a `.json` file, and click **Import**. If the file's program ID already exists, a **Program Already Exists** dialog appears offering **Cancel** or **Overwrite** — overwriting replaces the existing program's configuration.

### Program card

Each card shows the program's name, ID, a description, and chips for sync mode (**Local only** or **Sync enabled**), entity count, and version. Clicking the card body opens the program's detail page.

The **⋮** menu holds, in order:

- **Edit** — opens the program wizard in edit mode
- **Duplicate** — opens the wizard pre-filled as a copy
- **Deploy to Device** — opens a dialog with the QR code a mobile device scans to load this program, plus **Download Config**
- **Download** — downloads the configuration as JSON
- **Archive** (or **Restore** for an already-archived program)
- **Delete (Dev Only)** — only present in development builds

:::info The QR code is in the dialog, not on the card
Cards do not display the deployment QR code. Open **⋮ → Deploy to Device** to show it.
:::

### Archive is reversible; permanent delete is not a production feature

**Archive** removes the program configuration from the active list. Its confirmation dialog states: "The program configuration will be removed. Collected entity data will not be affected." Archived programs come back via **Show archived** → **⋮ → Restore**.

A true permanent delete exists as **Delete (Dev Only)** → **Delete Forever**, but it is compiled out of production builds and is unavailable on a deployed instance.

## 3. The Collection Program Detail Page

Clicking a card opens the program detail page: a status chip (**Local only** / **Sync enabled** / **Syncing…**), the version, the program name, an **Edit** button, and a **⋮** menu offering **Deploy to Device**, **Duplicates**, **View device sync activity**, **Conflicts**, **Duplicate Config**, **Download JSON**, and **Archive**.

### Tabs

| Tab | Contents |
|-----|----------|
| **Entities** | Latest captured records per form, in tables of GUID, Name, Type, Last Updated. Rows are clickable and open the entity detail page. |
| **Forms** | The program's entity forms; each card has an **Edit** button opening a single-form editor |
| **Integration** | Current adapter settings, with **Edit Integration** (or **Configure Integration** if unset) |
| **Programs** | OpenSPP program-enrolment offerings — only shown for OpenSPP adapters |
| **Claim-169** | Trusted-issuer configuration — only shown for OpenSPP adapters |
| **Field Mapping** | Current mappings, with **Edit Mapping** / **Configure Mapping** |
| **Authentication** | Auth providers, with **Edit Authentication** / **Configure Authentication** |

Each tab's edit button deep-links to the matching wizard step.

### Sync

For programs with external sync configured, a sync panel offers **Trigger Sync** (showing "Syncing…" while it runs, with a **Cancel** action) and a **History** toggle listing past runs by Time, Status, Pushed, Pulled, Failed, and Duration.

Where per-device sync is enabled, a **Sync scope** card shows which records reach devices, with its own **Edit** control. Unbounded scope means every device receives the full dataset.

### Data Diagnostics

At the bottom of the page, a collapsible **Data Diagnostics** section reports entity counts per form and a raw JSON dump of entity records. It is available in production builds too.

## 4. Creating and Editing a Program (the Wizard)

Programs are created and edited through a multi-step wizard, reached from the dashboard's **New Collection Program** button, a card's **⋮ → Edit** or **Duplicate**, or any **Edit …** button on the detail page. The wizard's header reads **New Collection Program**, **Edit Collection Program**, or **Duplicate Collection Program** to match the mode.

Navigate with **Previous** and **Continue** at the bottom, or by clicking an earlier step in the left sidebar — you cannot skip ahead to a step you have not reached. Attempting to continue past invalid input shows "Please fix the errors before continuing". The wizard autosaves as you work ("Just saved", "Saved a moment ago", "Saved at TIME"); if you return with work outstanding, a **Recover Unsaved Draft?** dialog offers **Start Fresh** or **Recover Draft**. Leaving via the header's **Programs** back button discards the draft.

:::note Desktop-oriented
The wizard warns on small screens that it is designed for desktop use; on a tablet, use landscape orientation.
:::

### Steps

| Step | Shown when |
|------|-----------|
| **General** | Always |
| **Integration** | Always |
| **Entity Forms** | Always |
| **Field Mapping** | Only for OpenSPP adapters |
| **Programs** | Only for OpenSPP adapters |
| **Claim-169** | Only for OpenSPP adapters |
| **Authentication** | Always |
| **Review** | Always |

The three OpenSPP-only steps simply do not appear in the sidebar for other adapter types.

### General

Program name, ID, description, and version.

### Integration

- **Integration Type** — OpenSPP V1, OpenSPP v2, or OpenFn. Development builds additionally offer Mock Registry Server.
- **API URL** — the external system's base URL.
- **Adapter Configuration** — typed fields that change with the selected adapter:
  - *OpenSPP V1*: Database Name, Username, Password (all required), plus optional Registrar Group, Batch Size, Batch Delay (ms), Max Retries
  - *OpenSPP V2*: OAuth Client ID and OAuth Client Secret (required), plus Batch Size, Include Studio Fields, Batch Delay (ms), Max Retries
  - *OpenFn*: API Key (required), Callback Token, Batch Size
- **Connection Test** — OpenSPP V2 only. **Test Connection** verifies the OAuth2 credentials before you continue; the button becomes **Connected** on success or **Retry** after a failure.
- **Legacy Extra Fields** — a collapsed panel that appears only for older configurations that still carry free-form `extraFields`. New programs use the typed adapter configuration above.

### Entity Forms

Each form card has:

- **Entity Name (ID)** — the machine name, e.g. `household` (required)
- **Display Title** — e.g. `Household Registration` (required)
- **Depends On (Optional)** — makes this form a child of another (e.g. Individual → Household). Circular relationships are detected and reported.
- **Entity Type** (required) — **Group / Household**, **Individual**, or **Record (activity linked to an entity)**. This determines how the data is stored and synced.
- **Display Name Field** — which field supplies the entity's display name. It appears once the form has designed fields; without it, entities show their ID.

:::caution Choose the entity type deliberately
The UI describes Entity Type as fixed after creation. It is a data-model decision, not a label — but note the control is not locked in edit mode, so changing it on an existing form is possible and unsupported.
:::

A status chip on each card reads **Ready**, **Needs Form Design**, or **Incomplete**.

**Design Form** (or **Edit Form Design** once a schema exists) opens the full-page **Form Designer** — a Form.io-based drag-and-drop builder where you add components, set validation, and lay out the form. Save with **Save Form Design**; leaving with unsaved work prompts **Keep Editing**, **Discard**, or **Save & Exit**.

For OpenSPP programs, this step also offers **Import from OpenSPP YAML**: upload a program specification and entity forms are generated from it.

### Field Mapping (OpenSPP only)

Map form fields to OpenSPP fields, with a transformer per pair.

**Loading the OpenSPP field list:**

- *OpenSPP V1* — click **Fetch Fields**. The URL, database, username, and password come from the Integration step; until all four are set the step shows "Complete the OpenSPP connection settings in the Integration step to enable field fetching."
- *OpenSPP V2* — click **Fetch Fields** (**Refresh Fields** afterwards, or **Clear** to discard). It needs the API URL plus the OAuth2 client ID and secret from the Integration step. Results are summarised as Total Fields / Core / Studio / Individual / Group, and listed in **Individual Fields** and **Group Fields** tables of Field Name, Label, Type, and Source.

**Mapping fields:** add rows with **Add Mapping**, choosing a form field, an OpenSPP field, and a transformer:

- **Text** — pass-through or string conversion (default)
- **Date** — converts between formats, with **Input Format** and **Output Format**
- **ID** — extracts the ID from OpenSPP relation values shaped like `{"id": 0, "display_name": ""}`
- **Multi-select** — joins and splits arrays using a configurable **Delimiter**
- **Boolean** — normalises checkbox values via **Truthy Value** / **Falsy Value**

Selecting a non-OpenSPP adapter reports that field mapping is not required for it.

### Programs (OpenSPP only)

Declares the OpenSPP programs beneficiaries can be enrolled into, keyed by the numeric `spp.program` ID — findable in OpenSPP under **Programs → Configuration**, at the end of the program detail page's URL. Leaving the list empty hides the enrolment picker in the mobile app.

### Claim-169 (OpenSPP only)

Configures the trusted issuers whose Claim-169 credentials this tenant accepts. Field-agent devices verify credential signatures offline against these keys, with no network call at scan time.

### Authentication

- One or more auth configurations, each with an **Authentication Type** (None, Auth0, or Keycloak) and its **Configuration Fields** as key/value pairs. Common Auth0 fields are `domain`, `clientId`, `audience`; common Keycloak fields are `realm`, `url`, `clientId`.
- **Self-Service Access** — lets beneficiaries reach their own data through the web app. Enable it, then choose **Authentication Methods** (OTP (SMS/Email), ID Verification, QR Code) and the **Allowed Forms** beneficiaries may view or submit.

### Review

A read-only summary of every section, flagging any that still need attention, with jump links back to each step. Submit with **Create Program** or **Update Program**. If the program ID collides with an existing one, the same **Program Already Exists** / **Overwrite** confirmation appears.

## 5. User Management

The **Users** page (**User Management**) lists accounts with their email, role, and a chip showing how many programs each is assigned to. **Create User** opens a dialog with:

- **Email**
- **Password** — minimum 8 characters including an uppercase letter, a lowercase letter, a number, and a special character. When editing a user, leave it blank to keep the current password.
- **Role** — `ADMIN` or `USER`
- **Assigned Programs** — a multi-select of the programs this user may work with

Where per-program sync scope is enabled, a **Sync scope overrides** section lets you narrow what a specific user receives for a specific program; each assignment otherwise inherits the program's own scope. Rows with an override show an **Override active** chip and can be reset with **Clear override**.

Row actions edit or delete a user; deletion is confirmed by a **Delete User** dialog.

## 6. Other Pages

| Page | How to reach it | Purpose |
|------|-----------------|---------|
| **Potential Duplicates** | Program detail → **⋮ → Duplicates** | Review and **Resolve** entity records flagged as possible duplicates |
| **Conflicts** | Program detail → **⋮ → Conflicts** | Review and resolve version conflicts detected during sync |
| **Per-device sync activity** | Program detail → **⋮ → View device sync activity** | Which devices have synced: Device, User, Last pull, Last push, Total pulled, Total pushed |
| Entity detail | Program detail → **Entities** tab → click a row | Entity Information and Entity Data, with GUID, ID, and Last Updated |
| Single-form editor | Program detail → **Forms** tab → **Edit** on a form card | Edit one form's design without walking the wizard |

:::note Feature-flagged
**Per-device sync activity** and the sync-scope controls belong to the per-device sync feature. Where it is disabled, both the menu entry and the page are unavailable.
:::

## 7. Navigation and Sign Out

The top navigation bar has **Home** (the Collection Programs dashboard) and **Users**. To sign out, click the account icon at the right of the bar and select **Logout**.
