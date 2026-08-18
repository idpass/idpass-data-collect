---
id: web-app
title: Web App
sidebar_position: 3
---

# Web App

The web app (`packages/web`) is a Vue 3 application that provides two workflows: **agent data collection** and **citizen self-service**.

## Landing Page

The root route `/` is a role-selection page offering two entry points:

- **Agent Login** → `/agent/login`
- **Citizen Portal** → `/citizen/login`

If you are already signed in, `/` forwards you straight to the matching area — agents to `/agent/login`, citizens to their tenant dashboard.

## Agent Workflow

Field agents use the web app to collect and manage beneficiary data in a browser, similar to the mobile app but without requiring installation.

### Features

- Form-based data collection using the same form configurations as mobile
- Offline-capable with IndexedDB storage
- Sync with the backend server
- QR code scanning for configuration loading

### Agent Routes

| Route | Description |
|-------|-------------|
| `/agent/login` | Agent login page |
| `/agent/:tenantId` | Dashboard — entity list for the selected tenant |
| `/agent/:tenantId/entity/new/:formId` | Create a new entity using the specified form |
| `/agent/:tenantId/entity/:guid` | View entity details |
| `/agent/:tenantId/entity/:guid/edit` | Edit an existing entity |

Four legacy URL shapes from earlier versions still resolve, so old bookmarks and QR codes keep working: `/agent/:tenantId/:entity/new`, `/agent/:tenantId/:entity/:guid/edit`, `/agent/:tenantId/:entity/:guid`, and `/agent/:tenantId/:entity`. Each redirects to its canonical route above (the last one drops the entity segment and lands on the dashboard).

### Getting Started

```bash
# Start the web app in development mode
pnpm dev:web
```

The app runs at `http://localhost:5174` by default.

## Citizen Self-Service

Citizens can access their own records and submit data through authenticated self-service flows. The entry point is `/citizen/login`.

:::info Enabled per tenant
Self-service is opt-in per tenant and **disabled by default**. Until an app config sets `selfService.enabled` to `true`, every self-service login and data route returns `403 Self-service is not enabled for this tenant`.
:::

### Step 1 — Select a program

The login page first asks for a **Program ID** (the tenant ID). On submit it fetches the tenant's public config to determine which authentication methods are enabled.

### Authentication Workflows

#### OTP (One-Time Password)

1. Citizen enters a phone number or email address. The backend matches it against the `phone`, then the `email` field of the tenant's entity records.
2. The backend generates a 6-digit code and stores it with a 5-minute expiry.
3. Citizen enters the code to complete authentication.
4. A scoped JWT (valid one hour) is issued and the citizen is redirected to `/citizen/:tenantId`.

:::warning Code delivery is not included
The backend generates and stores the code but does **not** send it. There is no SMS or email gateway in the server — integrating one is a deployment responsibility. Until you wire up delivery, the only way to obtain a code is the development flag below.
:::

For local development, start the backend with `OTP_EXPOSE_DEV_CODE=true` and the code is returned in the request response as a `devCode` field. The web app additionally only displays it when it is itself running a Vite dev build (`pnpm dev:web`), so a production bundle never shows the code even if the backend exposes it. The flag is matched against the exact string `true`.

Request throttling: 5 code requests and 10 verification attempts per 15 minutes, plus a cap of 5 outstanding codes per identifier.

#### National ID

1. Citizen enters their national identity number and date of birth.
2. The backend validates the combination against the stored entity record — first by national ID plus date of birth, then falling back to a match against the entity's `national-id` identifier entry.
3. On match, a scoped JWT is issued and the citizen is redirected to `/citizen/:tenantId`. No match returns `401 Verification failed`.

#### OIDC

1. Citizen clicks the **Login with eSignet** button. The button label is fixed — only the underlying OIDC configuration is per-tenant, so the button reads "eSignet" whichever provider you point it at.
2. The browser is redirected to the external identity provider's authorization endpoint.
3. After authentication the provider redirects back to `/callback` (or to whatever `redirectUri` the tenant config sets).
4. `OidcCallbackView` completes the provider handshake, then exchanges the resulting tokens with the backend for a scoped self-service JWT and forwards the citizen to their dashboard.

The OIDC provider, client ID, redirect URI, scopes, and optional ACR values are all configured per-tenant in the app config's `selfService.oidcConfig` block.

### Self-Service Routes

| Route | Description |
|-------|-------------|
| `/citizen/login` | Program selection and authentication |
| `/callback` | OIDC authorization code callback (a top-level route, not nested under `/citizen`) |
| `/citizen/:tenantId` | Citizen dashboard |
| `/citizen/:tenantId/profile` | View personal record |
| `/citizen/:tenantId/submissions` | Submission history |
| `/citizen/:tenantId/change-request/:formType` | Submit a change request using the specified form |

### Self-Service Features

- View personal records and submission history
- Submit change request forms configured by the program administrator
- Authentication via OTP, National ID, or OIDC — whichever methods are enabled for the tenant

### Security

Self-service tokens are scoped to prevent access to admin or sync routes — presenting one to an admin, sync, or entity endpoint returns `403 Forbidden: self-service tokens cannot access this endpoint`. Entity isolation ensures citizens can only access their own records: each token is bound to one `entityGuid`, and a request naming a different one is rejected with `403 Forbidden: cannot access other entities`, so cross-entity enumeration is not possible.

## Deployment

The web app is built as a static SPA and served via nginx in production:

```bash
# Build for production
pnpm build:web
```

The build output is in `packages/web/dist/` and can be served by any static file server. The Docker multi-stage build handles this automatically with nginx.
