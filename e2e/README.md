# Cross-Service E2E Tests

End-to-end tests that verify full data lifecycle workflows across the backend, admin UI, and web UI.

## Prerequisites

All three services must be running before executing these tests:

- **Backend** on `http://localhost:3000` (Express + PostgreSQL)
- **Admin UI** on `http://localhost:5173`
- **Web UI** on `http://localhost:5174`

Start them with:

```bash
pnpm dev:backend   # terminal 1
pnpm dev:admin     # terminal 2
pnpm dev:web       # terminal 3
```

Playwright browsers must be installed:

```bash
pnpm exec playwright install chromium
```

## Running

From the repo root:

```bash
pnpm test:e2e:integration
```

## Environment Variables

| Variable         | Default                              | Description           |
| ---------------- | ------------------------------------ | --------------------- |
| `BACKEND_URL`    | `http://localhost:3000`              | Backend API base URL  |
| `ADMIN_URL`      | `http://localhost:5173`              | Admin UI base URL     |
| `WEB_URL`        | `http://localhost:5174`              | Web UI base URL       |
| `ADMIN_EMAIL`    | `admin@datacollect.lan`              | Admin login email     |
| `ADMIN_PASSWORD` | `correct horse battery staple 42!`   | Admin login password  |

## Test Suites

- **data-lifecycle.spec.ts** - Full lifecycle: admin creates config, field worker submits household data via web UI, admin verifies data in admin UI.
- **sync-workflow.spec.ts** - Sync verification: seed entities via API, field worker sees them in web UI, verify consistency between UI and API.
