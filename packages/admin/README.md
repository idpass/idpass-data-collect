# ID PASS DataCollect Admin UI

Web-based admin interface for managing ID PASS DataCollect application configurations, users, and monitoring data synchronization.

## Purpose

The Admin UI provides a comprehensive interface for:
- Managing application configurations (apps)
- Configuring entity forms using Form.io builder
- Setting up external sync adapters (OpenSPP, OpenFn)
- Configuring field mappings for OpenSPP synchronization
- Managing user accounts and permissions
- Monitoring entity counts and sync status

## Prerequisites

- Node.js 22.x or higher
- pnpm 10.x
- Backend server running (see `packages/backend`)

## Setup

This package is part of the ID PASS DataCollect monorepo. Install dependencies from the workspace root:

```bash
# From workspace root
pnpm install
```

## Development

Start the development server:

```bash
# From workspace root
pnpm dev:admin

# Or from this directory
pnpm dev
```

The admin UI will be available at `http://localhost:5173` (or the next available port).

## Building for Production

```bash
# From workspace root
pnpm build:admin

# Or from this directory
pnpm build
```

The built files will be in the `dist/` directory.

## Features

### App Configuration Management
- Create, edit, and delete application configurations
- Upload JSON configuration files
- Visual form builder using Form.io
- Configure entity form dependencies

### External Sync Configuration
- Configure OpenSPP adapter with field mappings
- Import OpenSPP field metadata (JSON upload, paste, or API fetch)
- Map form fields to OpenSPP fields with transformers
- Configure batch processing settings

### Submission Review Workflow
- Review submitted form data through a pending/approved/rejected pipeline
- Approve or reject individual submissions with optional reviewer comments
- Audit trail of all review decisions

### Duplicate Detection and Resolution
- Automatic flagging of potential duplicate entities
- Side-by-side comparison UI for reviewing suspected duplicates
- Merge or dismiss duplicate candidates

### User Management
- Create and manage user accounts
- Assign roles (admin, user)
- Strong password validation enforced on account creation and updates
- View user list and details

### Data Monitoring
- View entity counts per configuration
- Monitor sync status
- Access QR codes for mobile app configuration

## Testing

Run unit tests:

```bash
pnpm test:unit
```

## Linting

Lint and fix code:

```bash
pnpm lint
```

## Type Checking

Check TypeScript types:

```bash
pnpm type-check
```

## Technology Stack

- Vue 3 with Composition API
- Vuetify 3 for UI components
- Form.io for form building
- Pinia for state management
- Vue Router for navigation
- Axios for API communication
- TypeScript for type safety

## Environment Variables

Create a `.env` file in the workspace root:

```env
VITE_API_URL=http://localhost:3000
```

## Related Documentation

- [Admin UI Dashboard Guide](../../website/docs/user-guide/admin-ui-dashboard.md)
- [OpenSPP Adapter Documentation](../../website/docs/adapters/openspp-adapter.md)
- [Backend API Documentation](../../website/docs/packages/backend/index.md)
