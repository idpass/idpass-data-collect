# Keycloak Adapter

The Keycloak adapter provides integration with Keycloak authentication services for ID PASS Data Collect.

## Overview

The adapter implements the `AuthAdapter` interface to provide Keycloak-specific authentication functionality using OpenID Connect (OIDC).

### Features

- Keycloak OIDC authentication
- Token validation
- Session management
- Realm-based access control
- Secure token storage

## Installation

```bash
npm install @idpass/datacollect
```

## Configuration

```typescript
const config = {
  type: "keycloak",
  fields: {
    authority: "https://keycloak.example.com/auth",
    client_id: "my-client",
    realm: "my-realm",
    redirect_uri: "http://localhost:3000/callback",
    response_type: "code",
    scope: "openid profile email"
  }
};
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

## Usage

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

### Realm-based Authentication

```typescript
const config = {
  type: "keycloak",
  fields: {
    authority: "https://keycloak.example.com/auth",
    client_id: "my-client",
    realm: "custom-realm",
    extraQueryParams: JSON.stringify({
      kc_idp_hint: "google" // Optional identity provider hint
    })
  }
};

const keycloakAdapter = new KeycloakAuthAdapter(storage, config);
```

### Token Validation

```typescript
// Validate token
const token = "eyJhbGciOiJSUzI1...";
const isValid = await keycloakAdapter.validateToken(token);
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

## Security Considerations

- Token validation uses Keycloak's userinfo endpoint
- Environment-aware validation (frontend/backend)
- Secure token storage through storage adapter
- Proper error handling for failed authentication

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

1. Always use HTTPS in production
2. Implement proper token rotation
3. Clear tokens on logout
4. Handle session expiration gracefully
5. Configure appropriate realm settings
6. Use identity provider hints when needed
7. Store sensitive data securely

## Integration with Identity Providers

Keycloak supports various identity providers:

```typescript
const config = {
  type: "keycloak",
  fields: {
    // ... other fields ...
    extraQueryParams: JSON.stringify({
      kc_idp_hint: "google", // For Google
      // Or
      kc_idp_hint: "github", // For GitHub
      // Or
      kc_idp_hint: "facebook" // For Facebook
    })
  }
};
``` 