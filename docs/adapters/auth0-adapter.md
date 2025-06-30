# Auth0 Adapter

The Auth0 adapter provides integration with Auth0 authentication services for ID PASS Data Collect.

## Overview

The adapter implements the `AuthAdapter` interface to provide Auth0-specific authentication functionality using OpenID Connect (OIDC).

### Features

- Auth0 OIDC authentication
- Token validation
- Session management
- Organization-based access control
- Secure token storage

## Installation

```bash
npm install @idpass/datacollect
```

## Configuration

```typescript
const config = {
  type: "auth0",
  fields: {
    authority: "https://example.auth0.com",
    client_id: "YOUR_CLIENT_ID",
    redirect_uri: "http://localhost:3000/callback",
    response_type: "code",
    scope: "openid profile email",
    organization: "org_123" // Optional
  }
};
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `authority` | `string` | Auth0 domain URL |
| `client_id` | `string` | Auth0 application client ID |
| `redirect_uri` | `string` | OAuth callback URL |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `post_logout_redirect_uri` | `string` | Post-logout redirect URL |
| `response_type` | `string` | OAuth response type (default: "code") |
| `scope` | `string` | OAuth scopes (default: "openid profile email") |
| `organization` | `string` | Auth0 organization ID |
| `extraQueryParams` | `object` | Additional OAuth query parameters |

## Usage

### Basic Setup

```typescript
import { Auth0AuthAdapter, IndexedDbAuthStorageAdapter } from "@idpass/datacollect";

// Create storage adapter
const storage = new IndexedDbAuthStorageAdapter();

// Initialize Auth0 adapter
const auth0Adapter = new Auth0AuthAdapter(storage, config);
await auth0Adapter.initialize();
```

### Authentication Flow

```typescript
// Login
const { username, token } = await auth0Adapter.login();

// Check authentication status
const isAuth = await auth0Adapter.isAuthenticated();

// Handle OAuth callback
await auth0Adapter.handleCallback();

// Logout
await auth0Adapter.logout();
```

### Organization-based Authentication

```typescript
const config = {
  type: "auth0",
  fields: {
    authority: "https://example.auth0.com",
    client_id: "YOUR_CLIENT_ID",
    organization: "org_123",
    extraQueryParams: JSON.stringify({
      organization: "org_123"
    })
  }
};

const auth0Adapter = new Auth0AuthAdapter(storage, config);
```

### Token Validation

```typescript
// Validate token
const token = "eyJhbGciOiJSUzI1...";
const isValid = await auth0Adapter.validateToken(token);
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
Checks if the user has a valid Auth0 session.

#### login()
```typescript
async login(): Promise<{ username: string; token: string }>
```
Initiates Auth0 login flow and returns user credentials.

#### logout()
```typescript
async logout(): Promise<void>
```
Logs out the user from Auth0 and clears stored tokens.

#### validateToken()
```typescript
async validateToken(token: string): Promise<boolean>
```
Validates an Auth0 access token.

#### handleCallback()
```typescript
async handleCallback(): Promise<void>
```
Processes Auth0 OAuth callback and stores tokens.

## Security Considerations

- Token validation uses Auth0's userinfo endpoint
- Organization validation during token checks
- Environment-aware validation (frontend/backend)
- Secure token storage through storage adapter
- Proper error handling for failed authentication

## Error Handling

```typescript
try {
  await auth0Adapter.login();
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

1. Always use HTTPS in production
2. Implement proper token rotation
3. Clear tokens on logout
4. Handle session expiration gracefully
5. Use organization validation when needed
6. Store sensitive data securely 