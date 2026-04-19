---
id: backend-overview
title: Overview
sidebar_position: 2
---

# Backend Package

The Backend package provides a central sync server for ID PASS DataCollect, enabling multi-client synchronization, user management, and integration with external systems.

Built with Node.js, Express.js, and PostgreSQL, the Backend serves as the central hub for:
- Multi-client data synchronization
- User authentication and authorization
- Multi-tenant configuration management
- External system integration

### Key Features

- 🗃️ **PostgreSQL Storage**: Reliable, ACID-compliant data persistence
- 🔄 **Multi-Client Sync**: Coordinate data across multiple DataCollect clients
- 👥 **User Management**: Authentication, authorization, and role-based access
- 🏢 **Multi-Tenant**: Support multiple organizations with isolated configurations
- 🔌 **External Integration**: Connect with OpenSPP, OpenFn, and custom systems
- 🔐 **Security**: [JWT](../../glossary#jwt-json-web-token) authentication with configurable session management

## Architecture

```mermaid
graph TB
    A[DataCollect Client 1] -->|Sync| B[Backend Server]
    C[DataCollect Client 2] -->|Sync| B
    D[DataCollect Client 3] -->|Sync| B
    
    B --> E[PostgreSQL Database]
    B --> F[Admin Interface]
    B -->|External Sync| G[OpenSPP]
    B -->|External Sync| H[OpenFn]
    B -->|External Sync| I[Custom Systems]
    
    subgraph "Backend Components"
        B
        E
    end
```

## Core Components

### Sync Server
Handles bidirectional synchronization between clients and server:
- **Event Processing**: Applies events from clients to server state
- **Conflict Resolution**: Manages concurrent updates with version control
- **Pagination**: Efficient data transfer with configurable batch sizes

### User Management
Complete authentication and authorization system:
- [JWT Authentication](../../glossary#jwt-json-web-token): Secure token-based authentication with OAuth provider support
- OAuth Integration: Support for Auth0, Keycloak, and custom OAuth providers
- Role-Based Access: Admin and user roles with different permissions
- Multi-Provider Auth: Configure multiple authentication providers per tenant
- Initial Setup: Automatic admin user creation on first run

### [Multi-Tenant Support](../../glossary#multi-tenant-support)
Isolated environments for different organizations:
- App Configurations: Custom forms and entity definitions per tenant
- Authentication Configs: Per-tenant OAuth provider configurations
- Data Isolation: Complete separation of tenant data
- External Sync Config: Per-tenant integration settings

## Quick Start

### Installation

```bash
cd backend
pnpm install
```

### Environment Setup

Create a `.env` file:

```env
# Database Configuration
POSTGRES=postgresql://admin:admin@localhost:5432/postgres
POSTGRES_TEST=postgresql://admin:admin@localhost:5432/test

# Authentication
ADMIN_EMAIL=admin@hdm.example
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret

# Server Configuration
PORT=3000
```

#### Password requirements

The `ADMIN_PASSWORD` value (and all passwords set through the user management API) must satisfy the following rules. The server will refuse to start if `ADMIN_PASSWORD` does not meet these requirements.

| Rule | Requirement |
| :--- | :--- |
| Minimum length | 8 characters |
| Uppercase letters | At least one (A–Z) |
| Lowercase letters | At least one (a–z) |
| Numbers | At least one (0–9) |
| Special characters | At least one (any character that is not A–Z, a–z, or 0–9) |

Example of a valid password: `S3cur3!Pass`

The same rules apply when creating or updating users via the `POST /api/users` and `PUT /api/users/:id` endpoints.

### Development

```bash
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

## Configuration

### App Configuration Files
Define tenant-specific settings using JSON configuration:

```json
{
  "id": "organization-1",
  "name": "Organization Name",
  "description": "Organization description",
  "version": "1.0.0",
  "authConfigs": [
    {
      "type": "auth0",
      "fields": {
        "domain": "your-domain.auth0.com",
        "clientId": "your-client-id",
        "audience": "your-api-audience",
        "scope": "openid profile email"
      }
    },
    {
      "type": "keycloak",
      "fields": {
        "url": "https://keycloak.example.com",
        "realm": "your-realm",
        "clientId": "your-client-id",
        "scope": "openid profile email"
      }
    }
  ],
  "entityForms": [
    {
      "name": "household",
      "title": "Household Registration",
      "formio": { /* FormIO JSON schema */ }
    }
  ],
  "entityData": [
    {
      "name": "household",
      "data": [ /* Initial data */ ]
    }
  ],
  "externalSync": {
    "type": "openspp",
    "auth": "basic",
    "url": "https://openspp.example.com",
    "credentials": {
      "username": "sync-user",
      "password": "sync-password"
    }
  }
}
```

## API Documentation

The Backend provides a comprehensive REST API with full OpenAPI 3.0 documentation:

### 📚 [Complete API Reference](./api-reference-overview.md)
Detailed documentation of all endpoints, request/response schemas, and examples.

### 🌐 [OpenAPI Specification](http://localhost:3000/api-docs/openapi.json)
OpenAPI spec available as JSON (when server is running). Import into Postman, Insomnia, or other API clients.

### 📄 [OpenAPI Specification](./api-reference-generated/idpass-data-collect-backend-api.md)
Complete OpenAPI 3.0 YAML specification for client generation and tooling.

### Quick API Overview

**Authentication & Users**
- `POST /api/users/login` - User authentication
- `GET /api/users` - User management (Admin only)
- `GET /api/users/me` - Current user info

**Data Synchronization**
- `GET /api/sync/pull` - Pull events from server
- `POST /api/sync/push` - Push events to server
- `POST /api/sync/external` - External system sync

**App Configuration**
- `GET /api/apps` - List configurations (supports `page`, `pageSize`, `sortBy`, `sortOrder`, and `search` query params; includes entity counts)
- `POST /api/apps` - Upload configuration
- `DELETE /api/apps/{id}` - Delete configuration

**Data Management**
- `GET /api/potential-duplicates` - List duplicates
- `POST /api/potential-duplicates/resolve` - Resolve duplicates

## External System Integration

### Available Adapters

#### OpenSPP Adapter
Integration with OpenSPP social protection platform :
- Push household and individual registrations from DataCollect into OpenSPP
- Requires Odoo credential configuration per tenant
- Pull support and advanced enrollment workflows are planned; treat current integration as beta

#### OpenFn Adapter
Integration with OpenFn workflow automation:
- Event-driven data transformation
- Custom workflow triggers
- Multi-system orchestration

#### Mock Registry Server
Development and testing adapter:
- Simulates external system behavior
- Configurable response patterns
- Testing synchronization logic

### Custom Adapter Development

Create custom adapters by implementing the `ExternalSyncAdapter` interface:

```typescript
interface ExternalSyncAdapter {
  async pushData(entities: EntityDoc[]): Promise<void>;
  async pullData(): Promise<EntityDoc[]>;
  async authenticate(credentials: ExternalSyncCredentials): Promise<boolean>;
}
```

## Deployment

### [Docker Deployment](https://github.com/idpass/idpass-data-collect/blob/main/docker/README.md)
Complete Docker setup with PostgreSQL

### [Environment Configuration](../../getting-started/configuration.md)
Detailed configuration options

## Monitoring and Maintenance

### Health Checks
- `GET /health` - Server health status
- `
