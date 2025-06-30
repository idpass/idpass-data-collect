# AuthManager

The `AuthManager` class provides centralized authentication management with support for multiple authentication providers and token persistence.

## Overview

The `AuthManager` handles authentication flows for different providers (Auth0, Keycloak) and manages token storage. It supports:

- Multiple authentication providers
- Token persistence through storage adapters
- Default username/password authentication
- Provider-specific authentication flows

## Constructor

```typescript
constructor(
  configs: AuthConfig[],
  syncServerUrl: string,
  authStorage?: AuthStorageAdapter
)
```

### Parameters

- `configs`: Array of authentication provider configurations
- `syncServerUrl`: URL of the sync server for default authentication
- `authStorage`: Optional storage adapter for token persistence

## Properties

| Name | Type | Description |
|------|------|-------------|
| `adapters` | `Record<string, AuthAdapter>` | Map of initialized authentication adapters |

## Methods

### initialize()

```typescript
async initialize(): Promise<void>
```

Initializes authentication adapters based on provided configurations.

### isAuthenticated()

```typescript
async isAuthenticated(): Promise<boolean>
```

Checks if the user is authenticated with any provider.

### login()

```typescript
async login(
  credentials: PasswordCredentials | TokenCredentials | null, 
  type?: string
): Promise<void>
```

Authenticates user with specified provider or default login.

#### Parameters
- `credentials`: Login credentials (username/password or token)
- `type`: Optional provider type (e.g. "auth0", "keycloak")

### logout()

```typescript
async logout(): Promise<void>
```

Logs out from all authentication providers and clears stored tokens.

### validateToken()

```typescript
async validateToken(type: string, token: string): Promise<boolean>
```

Validates a token with the specified provider.

### handleCallback()

```typescript
async handleCallback(type: string): Promise<void>
```

Handles OAuth/OIDC callback for specified provider.

## Examples

### Basic Usage

```typescript
const config = [{
  type: "auth0",
  fields: {
    domain: "example.auth0.com",
    clientId: "YOUR_CLIENT_ID"
  }
}];

const authManager = new AuthManager(config, "https://api.example.com");
await authManager.initialize();

// Login with Auth0
await authManager.login(null, "auth0");

// Check authentication status
const isAuth = await authManager.isAuthenticated();

// Logout
await authManager.logout();
```

### Multiple Providers

```typescript
const configs = [
  {
    type: "auth0",
    fields: {
      domain: "example.auth0.com",
      clientId: "AUTH0_CLIENT_ID"
    }
  },
  {
    type: "keycloak",
    fields: {
      realm: "myrealm",
      clientId: "KEYCLOAK_CLIENT_ID",
      url: "https://keycloak.example.com"
    }
  }
];

const authManager = new AuthManager(configs, "https://api.example.com");
await authManager.initialize();
```

### With Token Storage

```typescript
const storage = new IndexedDbAuthStorageAdapter();
const authManager = new AuthManager(configs, "https://api.example.com", storage);

// Tokens will persist across sessions
await authManager.initialize();
await authManager.login(credentials);
```

### Default Login

```typescript
const credentials = {
  username: "user@example.com",
  password: "password123"
};

// Use default username/password authentication
await authManager.login(credentials);
``` 