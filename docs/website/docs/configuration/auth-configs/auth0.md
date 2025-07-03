---
id: auth-configs-auth0
title: Auth0
sidebar_position: 3
---

# Auth0

## Overview

The Auth0 adapter provides integration with Auth0 authentication services for ID PASS Data Collect using OpenID Connect (OIDC).

:::info
Auth0 integration provides enterprise-grade authentication with features like organization support, social logins, and advanced token management. The adapter handles all OAuth2/OIDC flows and token lifecycle management.
:::

## Configuration

### Basic Configuration

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

## Features

- **OIDC Authentication**: Standard OpenID Connect flows
- **Token Management**: Automatic token refresh and validation
- **Organization Support**: Multi-tenant authentication
- **Social Logins**: Support for various identity providers
- **Secure Storage**: Token persistence with encryption

## Implementation

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

### Security
1. Always use HTTPS in production
2. Implement proper token rotation
3. Clear tokens on logout
4. Handle session expiration gracefully
5. Use organization validation when needed
6. Store sensitive data securely

### Performance
1. Use appropriate storage adapter
2. Implement token caching
3. Handle token refresh efficiently

### Monitoring
1. Log authentication operations
2. Track authentication success/failure
3. Monitor token lifecycle events

## Troubleshooting

### Common Issues

1. **Token Validation Failures**
   - Check token expiration
   - Verify Auth0 domain configuration
   - Ensure proper scopes are requested

2. **Callback Handling Issues**
   - Verify redirect URI matches Auth0 settings
   - Check for proper state parameter
   - Ensure proper error handling

3. **Organization Access Issues**
   - Verify organization ID
   - Check user organization membership
   - Validate organization settings

### Debug Mode

Enable debug logging for troubleshooting:

```typescript
const auth0Adapter = new Auth0AuthAdapter(storage, {
  ...config,
  fields: {
    ...config.fields,
    extraQueryParams: JSON.stringify({
      debug: true
    })
  }
});
```