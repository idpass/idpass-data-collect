---
id: index
title: Authentication Configs Overview
sidebar_position: 1
---

# Authentication Configs Overview

## Overview

The Authentication system in DataCollect provides a unified interface for handling different authentication providers and methods. It implements the Strategy pattern to support multiple authentication providers through pluggable adapters.

**Purpose**: This authentication configuration is used to authenticate client instances before they can push and pull data from the sync server. This is also known as **internal sync** - the process of synchronizing data between client instances and the central sync server.

Authentication contexts define how clients authenticate with the DataCollect backend.

**[Internal Sync Context](../../glossary#internal-sync)**: Client instances must be properly authenticated using these configurations before they can perform data synchronization operations (push/pull) with the sync server. This ensures secure and authorized data exchange between distributed client instances and the central data repository.

**External Sync Context**: The backend uses these configurations to authenticate when synchronizing data with external systems (e.g., OpenSPP, custom APIs).

## Sample Configuration

Here's a complete example of an authentication configuration with detailed field explanations:

```json
{
  "authConfigs": [
    {
      "type": "auth0",
      "fields": {
        "authority": "https://example.auth0.com",
        "client_id": "YOUR_CLIENT_ID",
        "redirect_uri": "http://localhost:3000/callback",
        "response_type": "code",
        "scope": "openid profile email",
        "organization": "org_123"
      }
    }
  ]
}
```

:::info
When no authentication configurations are provided, the system defaults to using [Built-in Authentication](./default-auth.md).
:::

### Field Explanations

#### `type` (Required)
- **Purpose**: Specifies which authentication adapter to use
- **Values**: 
  - `"auth0"` - For Auth0 integration
  - `"keycloak"` - For Keycloak integration
  - Custom adapter types as defined in your system
- **Example**: `"auth0"`

#### `fields` (Required Object)
- **Purpose**: Provider-specific configuration parameters
- **Common Fields**:
  - `authority`: Base URL of the authentication server
  - `client_id`: OAuth client identifier
  - `redirect_uri`: OAuth callback URL
  - `response_type`: OAuth response type (usually "code")
  - `scope`: OAuth scopes requested

### Configuration Examples by Provider

#### Auth0 Configuration
```json
{
  "type": "auth0",
  "fields": {
    "authority": "https://example.auth0.com",
    "client_id": "YOUR_CLIENT_ID",
    "redirect_uri": "http://localhost:3000/callback",
    "scope": "openid profile email",
    "organization": "org_123"
  }
}
```

#### Keycloak Configuration
```json
{
  "type": "keycloak",
  "fields": {
    "authority": "https://keycloak.example.com/auth",
    "client_id": "my-client",
    "realm": "my-realm",
    "redirect_uri": "http://localhost:3000/callback",
    "scope": "openid profile email"
  }
}
```

## Architecture

### Design Pattern
The Authentication system uses the **Strategy pattern** to handle different authentication providers:

- **Context**: `AuthManager` acts as the context that manages the authentication strategy
- **Strategy**: Each adapter (e.g., `Auth0Adapter`, `KeycloakAdapter`) implements the `AuthAdapter` interface
- **Registry**: The `adaptersMapping` object serves as a registry of available strategies

### Key Components

```typescript
const adaptersMapping = {
  "auth0": Auth0AuthAdapter,
  "keycloak": KeycloakAuthAdapter,
};
```

## Available Adapters

### 1. Auth0 Adapter

**Type**: `auth0`

Integration with Auth0 authentication services:

- **Features**: OIDC authentication, token validation, organization support
- **Documentation**: See [Auth0 Configuration](auth0.md)

### 2. Keycloak Adapter

**Type**: `keycloak`

Integration with Keycloak authentication services:

- **Features**: OIDC authentication, token validation, realm support
- **Documentation**: See [Keycloak Configuration](keycloak.md)

## Usage Examples

### Basic Initialization

```typescript
import { AuthManager, IndexedDbAuthStorageAdapter } from '@idpass/datacollect';

// Configuration
const config = {
  type: 'auth0',
  fields: {
    authority: 'https://example.auth0.com',
    client_id: 'YOUR_CLIENT_ID',
    redirect_uri: 'http://localhost:3000/callback'
  }
};

// Initialize storage
const storage = new IndexedDbAuthStorageAdapter();

// Initialize manager
const authManager = new AuthManager([config], 'https://api.example.com', storage);
await authManager.initialize();

// Check authentication
if (await authManager.isAuthenticated()) {
  console.log('User is authenticated');
}
```

### Error Handling

```
```