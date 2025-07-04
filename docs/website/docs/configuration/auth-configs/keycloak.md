---
id: auth-configs-keycloak
title: Keycloak
sidebar_position: 4
---

# Keycloak

## Overview

The Keycloak adapter provides integration with Keycloak authentication services for ID PASS Data Collect using OpenID Connect (OIDC).

:::info
Keycloak integration offers enterprise identity and access management with features like realm-based authentication, role management, and identity brokering. The adapter handles all OAuth2/OIDC flows and provides seamless integration with various identity providers.
:::

## Configuration

### Basic Configuration

```json
{
  "type": "keycloak",
  "fields": {
    "authority": "https://keycloak.example.com/auth",
    "client_id": "my-client",
    "realm": "my-realm",
    "redirect_uri": "http://localhost:3000/callback",
    "response_type": "code",
    "scope": "openid profile email"
  }
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `authority` | `string` | Keycloak server URL |
| `client_id` | `string` | Client ID from Keycloak |
| `realm` | `string` | Keycloak realm name |
| `redirect_uri` | `string` | OAuth callback URL |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `post_logout_redirect_uri` | `string` | Post-logout redirect URL |
| `response_type` | `string` | OAuth response type (default: "code") |
| `scope` | `string` | OAuth scopes (default: "openid profile email") |
| `extraQueryParams` | `object` | Additional OAuth query parameters |

## Features

- **OIDC Authentication**: Standard OpenID Connect flows
- **Realm Management**: Multi-tenant authentication
- **Role-Based Access**: Fine-grained access control
- **Identity Brokering**: Support for external identity providers
- **Token Management**: Automatic token refresh and validation
- **Session Management**: Unified session handling

## Implementation

### Basic Setup

```typescript
import { KeycloakAuthAdapter, IndexedDbAuthStorageAdapter } from "@idpass/datacollect";

// Create storage adapter
const storage = new IndexedDbAuthStorageAdapter();

// Initialize Keycloak adapter
const keycloakAdapter = new KeycloakAuthAdapter(storage, config);
await keycloakAdapter.initialize();
```

### Authentication Flow

```typescript
// Login
const { username, token } = await keycloakAdapter.login();

// Check authentication status
const isAuth = await keycloakAdapter.isAuthenticated();

// Get stored auth data
const authData = await keycloakAdapter.getStoredAuth();

// Handle OAuth callback
await keycloakAdapter.handleCallback();

// Logout
await keycloakAdapter.logout();
```

### Identity Provider Integration

```typescript
const config = {
  type: "keycloak",
  fields: {
    authority: "https://keycloak.example.com/auth",
    client_id: "my-client",
    realm: "custom-realm",
    extraQueryParams: JSON.stringify({
      kc_idp_hint: "google",  // For Google
      // Or "github" for GitHub
      // Or "facebook" for Facebook
    })
  }
};

const keycloakAdapter = new KeycloakAuthAdapter(storage, config);
```

## API Reference

### Methods

#### initialize()
```typescript
async initialize(): Promise<void>
```
Initializes the adapter and restores any existing session.

#### isAuthenticated()
```typescript
async isAuthenticated(): Promise<boolean>
```
Checks if the user has a valid Keycloak session.

#### login()
```typescript
async login(): Promise<{ username: string; token: string }>
```
Initiates Keycloak login flow and returns user credentials.

#### logout()
```typescript
async logout(): Promise<void>
```
Logs out the user from Keycloak and clears stored tokens.

#### validateToken()
```typescript
async validateToken(token: string): Promise<boolean>
```
Validates a Keycloak access token.

#### handleCallback()
```typescript
async handleCallback(): Promise<void>
```
Processes Keycloak OAuth callback and stores tokens.

#### getStoredAuth()
```typescript
async getStoredAuth(): Promise<AuthResult | null>
```
Retrieves the stored authentication data.

## Error Handling

```typescript
try {
  await keycloakAdapter.login();
} catch (error) {
  if (error.message.includes('invalid_grant')) {
    console.error('Invalid credentials');
  } else if (error.message.includes('invalid_client')) {
    console.error('Client configuration error');
  } else {
    console.error('Authentication failed:', error);
  }
}
```

## Best Practices

### Security
1. Always use HTTPS in production
2. Implement proper token rotation
3. Clear tokens on logout
4. Handle session expiration gracefully
5. Configure appropriate realm settings
6. Use identity provider hints when needed
7. Store sensitive data securely

### Performance
1. Use appropriate storage adapter
2. Implement token caching
3. Handle token refresh efficiently
4. Configure proper session timeouts

### Monitoring
1. Log authentication operations
2. Track authentication success/failure
3. Monitor token lifecycle events
4. Track identity provider usage

## Troubleshooting

### Common Issues

1. **Token Validation Failures**
   - Check token expiration
   - Verify Keycloak server configuration
   - Ensure proper realm settings
   - Check client configuration

2. **Callback Handling Issues**
   - Verify redirect URI configuration
   - Check for proper state parameter
   - Ensure proper error handling
   - Validate client protocol settings

3. **Identity Provider Issues**
   - Verify IDP configuration in realm
   - Check identity provider availability
   - Validate broker settings
   - Check IDP credentials

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
const keycloakAdapter = new KeycloakAuthAdapter(storage, {
  ...config,
  fields: {
    ...config.fields,
    extraQueryParams: JSON.stringify({
      debug: true,
      log_level: 'debug'
    })
  }
});
```