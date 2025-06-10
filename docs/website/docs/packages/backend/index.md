---
id: backend-overview
title: Backend Package
sidebar_position: 2
---

# Backend Package

The Backend package provides a central sync server for ID PASS Data Collectct, enabling multi-client synchronization, user management, and integration with external systems.

## Overview

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
- 🔐 **Security**: JWT authentication with configurable session management

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
- **JWT Authentication**: Secure token-based authentication
- **Role-Based Access**: Admin and user roles with different permissions
- **Initial Setup**: Automatic admin user creation on first run

### Multi-Tenant Support
Isolated environments for different organizations:
- **App Configurations**: Custom forms and entity definitions per tenant
- **Data Isolation**: Complete separation of tenant data
- **External Sync Config**: Per-tenant integration settings

## Quick Start

### Installation

```bash
cd backend
npm install
```

### Environment Setup

Create a `.env` file:

```env
# Database Configuration
POSTGRES=postgresql://admin:admin@localhost:5432/postgres
POSTGRES_TEST=postgresql://admin:admin@localhost:5432/test

# Authentication
INITIAL_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret

# Server Configuration
PORT=3000
```

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
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

### 📚 [Complete API Reference](./api-reference/)
Detailed documentation of all endpoints, request/response schemas, and examples.

### 🌐 [Interactive API Documentation](http://localhost:3000/api-docs)
Live Swagger UI for testing endpoints directly (available when server is running).

### 📄 [OpenAPI Specification](./api-reference/openapi-spec)
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
- `GET /api/apps` - List configurations
- `POST /api/apps` - Upload configuration
- `DELETE /api/apps/{id}` - Delete configuration

**Data Management**
- `GET /api/potential-duplicates` - List duplicates
- `POST /api/potential-duplicates/resolve` - Resolve duplicates

## External System Integration

### Available Adapters

#### OpenSPP Adapter
Integration with OpenSPP social protection platform:
- Bidirectional data synchronization
- Beneficiary registration and updates
- Program enrollment management

#### OpenFn Adapter
Integration with OpenFn workflow automation:
- Event-driven data transformation
- Custom workflow triggers
- Multi-system orchestration

#### Mock Sync Server
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

### [Docker Deployment](./deployment/docker.md)
Complete Docker setup with PostgreSQL

### [Production Deployment](./deployment/production.md)
Best practices for production environments

### [Environment Configuration](./configuration.md)
Detailed configuration options

## Monitoring and Maintenance

### Health Checks
- `GET /health` - Server health status
- `GET /health/db` - Database connectivity
- `GET /health/sync` - Sync status

### Logging
Structured logging with configurable levels:
- Request/response logging
- Sync operation tracking
- Error reporting and debugging

### Performance
- Connection pooling for PostgreSQL
- Request rate limiting
- Automatic cleanup of old sync records

## Security Considerations

- **JWT Token Security**: Configurable expiration and refresh
- **Password Hashing**: bcrypt with configurable rounds
- **Database Security**: Parameterized queries prevent SQL injection
- **CORS Configuration**: Configurable cross-origin policies
- **Input Validation**: Comprehensive request validation

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testPathPattern=syncServer
npm test -- --testPathPattern=auth
```

## Next Steps

- 📖 [Configuration Guide](./configuration.md) - Detailed setup options
- 🚀 [Deployment Guides](./deployment/) - Production deployment
- 🔌 [API Reference](./api-reference/) - Complete REST API documentation
- 👥 [Admin Package](../admin/) - Web interface for management