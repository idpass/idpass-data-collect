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

### Getting Started

```bash
# Start the web app in development mode
pnpm dev:web
```

The app runs at `http://localhost:5174` by default.

## Citizen Self-Service

Citizens can access their own records and submit data through authenticated self-service flows.

### Authentication Methods

The self-service portal supports multiple authentication methods:

- **OTP (One-Time Password)**: Citizens receive a code via SMS or email
- **National ID**: Authentication via national identity number
- **OIDC**: Integration with external identity providers

### Self-Service Features

- View personal records and submission history
- Submit new forms (e.g., update contact information, request services)
- Download or view attachments

### Security

Self-service tokens are scoped to prevent access to admin or sync routes. Entity isolation ensures citizens can only access their own records — cross-entity enumeration is not possible.

## Deployment

The web app is built as a static SPA and served via nginx in production:

```bash
# Build for production
pnpm build:web
```

The build output is in `packages/web/dist/` and can be served by any static file server. The Docker multi-stage build handles this automatically with nginx.
