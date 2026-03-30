---
id: web-app
title: Web App
sidebar_position: 3
---

# Web App

The web app (`packages/web`) is a Vue 3 application that provides two workflows: **agent data collection** and **citizen self-service**.

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

### Getting Started

```bash
# Start the web app in development mode
pnpm dev:web
```

The app runs at `http://localhost:5174` by default.

## Citizen Self-Service

Citizens can access their own records and submit data through authenticated self-service flows. The entry point is `/citizen/login`.

### Step 1 — Select a program

The login page first asks for a **Program ID** (the tenant ID). On submit it fetches the tenant's public config to determine which authentication methods are enabled.

### Authentication Workflows

#### OTP (One-Time Password)

1. Citizen enters a phone number or email address.
2. The backend sends a one-time code via SMS or email.
3. Citizen enters the 6-digit code to complete authentication.
4. A scoped JWT is issued and the citizen is redirected to `/citizen/:tenantId`.

> In development mode (`NODE_ENV=development`) the OTP code is returned in the API response and displayed in the UI as a convenience.

#### National ID

1. Citizen enters their national identity number and date of birth.
2. The backend validates the combination against the stored entity record.
3. On match, a scoped JWT is issued and the citizen is redirected to `/citizen/:tenantId`.

#### OIDC

1. Citizen clicks the "Login with [provider]" button.
2. The browser is redirected to the external identity provider's authorization endpoint.
3. After authentication the provider redirects back to `/callback`.
4. The `OidcCallbackView` exchanges the authorization code for a token and completes the login.

The OIDC provider, client ID, redirect URI, scopes, and optional ACR values are all configured per-tenant in the app config's `selfService.oidcConfig` block.

### Self-Service Routes

| Route | Description |
|-------|-------------|
| `/citizen/login` | Program selection and authentication |
| `/callback` | OIDC authorization code callback |
| `/citizen/:tenantId` | Citizen dashboard |
| `/citizen/:tenantId/profile` | View personal record |
| `/citizen/:tenantId/submissions` | Submission history |
| `/citizen/:tenantId/change-request/:formType` | Submit a change request using the specified form |

### Self-Service Features

- View personal records and submission history
- Submit change request forms configured by the program administrator
- Authentication via OTP, National ID, or OIDC — whichever methods are enabled for the tenant

### Security

Self-service tokens are scoped to prevent access to admin or sync routes. Entity isolation ensures citizens can only access their own records — cross-entity enumeration is not possible.

## Deployment

The web app is built as a static SPA and served via nginx in production:

```bash
# Build for production
pnpm build:web
```

The build output is in `packages/web/dist/` and can be served by any static file server. The Docker multi-stage build handles this automatically with nginx.
