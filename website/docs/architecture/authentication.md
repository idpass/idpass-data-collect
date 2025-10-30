---
id: authentication
title: Authentication Architecture
sidebar_position: 4
description: ID PASS Data Collect authentication system architecture and components
---

# Authentication Architecture

The ID PASS Data Collect authentication system provides a flexible, secure, and extensible authentication framework that supports multiple authentication providers and secure token storage.

## Overview

The authentication architecture consists of three main components:

1. **AuthManager**: Central authentication coordinator
2. **Auth Adapters**: Provider-specific implementations (Auth0, Keycloak)
3. **Storage Adapters**: Token persistence layer

```mermaid
graph TD
    A[AuthManager] --> B[Auth Adapters]
    A --> C[Storage Adapters]
    B --> D[Auth0]
    B --> E[Keycloak]
    C --> F[IndexedDB]
    C --> G[Future Storage]
```

## Core Components

### AuthManager

The `AuthManager` class serves as the central coordinator for authentication operations:

- Manages multiple authentication providers
- Coordinates token storage and retrieval
- Handles authentication state
- Provides unified authentication interface

### Auth Adapters

Provider-specific adapters implement the `AuthAdapter` interface:

- **Auth0Adapter**: Auth0-specific implementation
- **KeycloakAdapter**: Keycloak-specific implementation
- Future adapters can be added by implementing the interface

### Storage Adapters

Storage adapters implement the `AuthStorageAdapter` interface:

- **IndexedDbAuthStorageAdapter**: Browser-based storage
- Extensible for different storage backends
- Multi-tenant support

## Authentication Flow

```mermaid
sequenceDiagram
    participant App
    participant AuthManager
    participant AuthAdapter
    participant StorageAdapter
    participant Provider

    App->>AuthManager: initialize()
    AuthManager->>AuthAdapter: initialize()
    AuthAdapter->>StorageAdapter: getStoredAuth()
    
    App->>AuthManager: login()
    AuthManager->>AuthAdapter: login()
    AuthAdapter->>Provider: authenticate()
    Provider-->>AuthAdapter: token
    AuthAdapter->>StorageAdapter: setToken()
    
    App->>AuthManager: isAuthenticated()
    AuthManager->>AuthAdapter: validateToken()
    AuthAdapter->>Provider: validate
    Provider-->>AuthAdapter: valid/invalid
```

## Token Management

### Storage

- Tokens are stored securely using the configured storage adapter
- Multi-tenant support through tenant-specific storage instances
- Automatic token cleanup on logout

### Validation

- Provider-specific token validation
- Environment-aware validation (frontend/backend)
- Regular token validation checks

## Security Features

1. **Token Security**
   - Secure token storage
   - Token validation on each use
   - Automatic token cleanup

2. **Provider Integration**
   - OAuth 2.0 and OpenID Connect support
   - Provider-specific security features
   - Organization/Realm-based access control

3. **Multi-tenant Security**
   - Tenant isolation
   - Separate storage per tenant
   - Tenant-specific configurations

## Configuration

### Auth0 Configuration

```typescript
const auth0Config = {
  type: "auth0",
  fields: {
    authority: "https://example.auth0.com",
    client_id: "CLIENT_ID",
    organization: "ORG_ID"
  }
};
```

### Keycloak Configuration

```typescript
const keycloakConfig = {
  type: "keycloak",
  fields: {
    authority: "https://keycloak.example.com",
    client_id: "CLIENT_ID",
    realm: "REALM_NAME"
  }
};
```

## Extension Points

The authentication system can be extended in several ways:

1. **New Auth Providers**
   - Implement `AuthAdapter` interface
   - Add provider-specific configuration
   - Register with `AuthManager`

2. **Storage Backends**
   - Implement `AuthStorageAdapter` interface
   - Add storage-specific configuration
   - Use with existing auth adapters

3. **Custom Validation**
   - Override validation methods
   - Add custom validation rules
   - Implement provider-specific checks

## Best Practices

1. **Security**
   - Use HTTPS in production
   - Implement token rotation
   - Regular token validation
   - Secure storage configuration

2. **Configuration**
   - Environment-specific settings
   - Proper error handling
   - Logging and monitoring

3. **Integration**
   - Single authentication instance
   - Proper initialization order
   - Clean logout handling


## Integration with EntityManager

The `EntityDataManager` integrates with `AuthManager` to provide authenticated data operations and synchronization capabilities:

```mermaid
graph TD
    A[EntityDataManager] --> B[AuthManager]
    A --> C[EventStore]
    A --> D[EntityStore]
    A --> E[EventApplierService]
    A --> F[InternalSyncManager]
    A --> G[ExternalSyncManager]
    F --> B
    G --> B
```

### Initialization

```typescript
const authManager = new AuthManager(
  [{ 
    type: "mock-auth-adapter", 
    fields: { url: "http://localhost:3000" } 
  }],
  "http://localhost:3000",
  authStorage
);

const entityManager = new EntityDataManager(
  eventStore,
  entityStore,
  eventApplierService,
  externalSyncManager,
  internalSyncManager,
  authManager
);
```

### Authentication Flow

```typescript
// Login
await entityManager.login({ 
  username: "admin@example.com", 
  password: "password123" 
});

// Check for unsynced events
const hasUnsynced = await entityManager.hasUnsyncedEvents();
if (hasUnsynced) {
  // Sync requires authentication
  await entityManager.syncWithSyncServer();
}

// Logout
await entityManager.logout();
```
