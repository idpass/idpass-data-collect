# IndexedDbAuthStorageAdapter

The `IndexedDbAuthStorageAdapter` provides browser-based persistent storage for authentication tokens using IndexedDB.

## Overview

This adapter implements the `AuthStorageAdapter` interface using IndexedDB for token persistence. It supports:

- Multi-tenant token storage
- Provider-specific token management
- Username storage
- Secure token persistence across sessions

## Constructor

```typescript
constructor(tenantId: string = "")
```

### Parameters

- `tenantId`: Optional tenant identifier for multi-tenant isolation

## Properties

| Name | Type | Description |
|------|------|-------------|
| `dbName` | `string` | Database name (defaults to "authStore") |
| `storeName` | `string` | Object store name (defaults to "tokens") |
| `db` | `IDBDatabase \| null` | IndexedDB database instance |

## Methods

### initialize()

```typescript
async initialize(): Promise<void>
```

Initializes the IndexedDB database and creates required object stores.

### getUsername()

```typescript
async getUsername(): Promise<string>
```

Retrieves the stored username.

### getToken()

```typescript
async getToken(): Promise<{ provider: string; token: string } | null>
```

Gets the first available authentication token.

### getTokenByProvider()

```typescript
async getTokenByProvider(provider: string = "current_token"): Promise<string>
```

Gets a token for a specific provider.

### setUsername()

```typescript
async setUsername(username: string): Promise<void>
```

Stores a username in the database.

### setToken()

```typescript
async setToken(key: string, token: string): Promise<void>
```

Stores an authentication token with a specific key.

### removeToken()

```typescript
async removeToken(key: string): Promise<void>
```

Removes a specific token by key.

### removeAllTokens()

```typescript
async removeAllTokens(): Promise<void>
```

Removes all stored tokens.

### clearStore()

```typescript
async clearStore(): Promise<void>
```

Clears all data from the store.

### closeConnection()

```typescript
async closeConnection(): Promise<void>
```

Closes the database connection.

## Examples

### Basic Usage

```typescript
const storage = new IndexedDbAuthStorageAdapter();
await storage.initialize();

// Store a token
await storage.setToken("auth0", "eyJhbGciOiJSUzI1...");

// Retrieve token
const token = await storage.getTokenByProvider("auth0");

// Remove token
await storage.removeToken("auth0");
```

### Multi-tenant Setup

```typescript
// Create tenant-specific storage
const tenantStorage = new IndexedDbAuthStorageAdapter("tenant-123");
await tenantStorage.initialize();

// Store tenant-specific tokens
await tenantStorage.setToken("keycloak", "eyJhbGciOiJSUzI1...");
```

### Managing Username

```typescript
const storage = new IndexedDbAuthStorageAdapter();
await storage.initialize();

// Store username
await storage.setUsername("user@example.com");

// Retrieve username
const username = await storage.getUsername();
```

### Complete Authentication Flow

```typescript
const storage = new IndexedDbAuthStorageAdapter();
await storage.initialize();

// After successful login
await storage.setUsername("user@example.com");
await storage.setToken("auth0", "eyJhbGciOiJSUzI1...");

// Check stored credentials
const username = await storage.getUsername();
const token = await storage.getTokenByProvider("auth0");

// On logout
await storage.removeAllTokens();
```

## Security Considerations

- Tokens are stored in the browser's IndexedDB, which provides secure storage within the same-origin policy
- No encryption is performed by default - tokens should be pre-encrypted if needed
- Clear tokens on logout using `removeAllTokens()`
- Consider implementing token rotation and expiration handling
- Database is isolated per origin and tenant 