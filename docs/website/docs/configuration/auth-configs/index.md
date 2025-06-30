---
id: index
title: Authentication Configs Overview
sidebar_position: 1
---

# Authentication Configs Overview

## Overview

The Authentication system in DataCollect provides a unified interface for handling different authentication providers and methods. It implements the Strategy pattern to support multiple authentication providers through pluggable adapters.

:::info
The authentication system is designed to be flexible and extensible, supporting various authentication providers like Auth0, Keycloak, and custom implementations. Each provider is implemented as an adapter that follows a common interface while handling provider-specific authentication flows.
:::

## Sample Configuration

Here's a complete example of an authentication configuration with detailed field explanations:

```json
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
```

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
- **Documentation**: See [Auth0 Configuration](auth0)

### 2. Keycloak Adapter

**Type**: `keycloak`

Integration with Keycloak authentication services:

- **Features**: OIDC authentication, token validation, realm support
- **Documentation**: See [Keycloak Configuration](keycloak)

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

```typescript
try {
  await authManager.login(null, 'auth0');
} catch (error) {
  if (error.message.includes('invalid_grant')) {
    console.error('Invalid credentials');
  } else if (error.message.includes('unauthorized_client')) {
    console.error('Client not authorized');
  } else {
    console.error('Authentication failed:', error);
  }
}
```

## Best Practices

### Security
- Always use HTTPS in production
- Implement proper token rotation
- Clear tokens on logout
- Handle session expiration gracefully
- Store sensitive data securely

### Performance
- Use appropriate storage adapters
- Handle token caching properly
- Implement proper error recovery

### Monitoring
- Log authentication operations
- Track authentication success/failure rates
- Monitor token expiration and renewal

## Extending the System

### Adding New Providers

To add support for a new authentication provider:

1. **Create Adapter Class**:
```typescript
class CustomAuthAdapter implements AuthAdapter {
  constructor(
    private storage: AuthStorageAdapter,
    private config: AuthConfig
  ) {}

  async login(): Promise<{ username: string; token: string }> {
    // Implement login logic
  }

  // Implement other required methods
}
```

2. **Register in Adapters Mapping**:
```typescript
const adaptersMapping = {
  "auth0": Auth0AuthAdapter,
  "keycloak": KeycloakAuthAdapter,
  "custom": CustomAuthAdapter, // Add new adapter
};
```

## Troubleshooting

### Common Issues

1. **Token Validation Failures**
   - Check token expiration
   - Verify provider configuration
   - Ensure proper scopes are requested

2. **Callback Handling Issues**
   - Verify redirect URI configuration
   - Check for proper state handling
   - Ensure proper error handling in callbacks

3. **Storage Issues**
   - Check storage adapter initialization
   - Verify storage permissions
   - Handle storage quota issues

For detailed provider-specific configuration options and advanced usage, refer to the respective provider documentation sections.