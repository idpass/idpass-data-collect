# ID PASS DataCollect Backend

> Express.js sync server with PostgreSQL for ID PASS DataCollect

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)

## Overview

`@idpass/data-collect-backend` is the central synchronization server for ID PASS DataCollect. It provides a REST API for client sync, multi-tenant configuration, user management, and integration with external beneficiary registries.

## Key Features

- **Multi-Tenant**: Serve multiple independent registries from a single deployment via app config files
- **JWT Authentication**: Role-based access with admin and field-worker roles
- **External Sync Adapters**: Built-in support for OpenSPP (V1 and V2) and OpenFn integrations
- **Review Workflow**: Submission review and approval before data is committed
- **Hash Chain Verification**: Merkle tree integrity verification for tamper-evident audit trails
- **OpenAPI Spec**: Machine-readable API documentation served at `/api-docs/openapi.json`

## Quick Start

### Environment Variables

```bash
# Required
POSTGRES=postgresql://user:password@localhost:5432/datacollect
JWT_SECRET=your-secret-key-at-least-32-chars
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=YourSecurePassword1!

# Optional
SYNC_SERVER_PORT=3000          # default: 3000
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

### Run in Development

```bash
pnpm dev
```

### Run in Production

```bash
pnpm build
node dist/index.js
```

### Database Migrations

```bash
pnpm db:migrate
```

## Configuration

Tenants are configured via JSON app config files. See the main project documentation for the full config schema.

## Contributing

See the main project [Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](../../LICENSE) for details.
