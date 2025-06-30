[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / IndexedDbAuthStorageAdapter

# Class: IndexedDbAuthStorageAdapter

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:119](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L119)

IndexedDB implementation of the AuthStorageAdapter for browser-based authentication token persistence.

This adapter provides secure, offline-first storage of authentication tokens using the browser's IndexedDB API.
It implements the full AuthStorageAdapter interface with proper token management and multi-tenant support.

Key features:
- **Secure Token Storage**: Stores authentication tokens locally in the browser using IndexedDB
- **Multi-Tenant Support**: Isolated token storage per tenant using tenant ID prefixes
- **Token Lifecycle Management**: Handles token storage, retrieval, and removal operations
- **Offline Capability**: Tokens persist across browser sessions and offline scenarios
- **Privacy-First**: Tokens are stored locally and not transmitted to external servers

Architecture:
- Uses IndexedDB object store with token as the primary data
- Implements proper error handling for IndexedDB operations
- Provides ACID transaction support for data consistency
- Supports both single and multi-tenant deployments

Security Considerations:
- Tokens are stored in the browser's IndexedDB, which is subject to browser security policies
- Tokens persist until explicitly removed or browser data is cleared
- Consider implementing token encryption for additional security if required

## Examples

Basic usage:
```typescript
const adapter = new IndexedDbAuthStorageAdapter('tenant-123');
await adapter.initialize();

// Store authentication token
await adapter.setToken('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...');

// Retrieve token for API calls
const token = await adapter.getToken();
if (token) {
  // Use token for authenticated requests
  const response = await fetch('/api/data', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
}

// Remove token on logout
await adapter.removeToken();
```

Multi-tenant setup:
```typescript
// Tenant-specific adapter
const tenantAdapter = new IndexedDbAuthStorageAdapter('org-xyz');
await tenantAdapter.initialize(); // Creates database: authStore_org-xyz

// Default adapter
const defaultAdapter = new IndexedDbAuthStorageAdapter();
await defaultAdapter.initialize(); // Creates database: authStore
```

Authentication flow integration:
```typescript
class AuthManager {
  private storage: IndexedDbAuthStorageAdapter;

  constructor(tenantId: string) {
    this.storage = new IndexedDbAuthStorageAdapter(tenantId);
  }

  async initialize() {
    await this.storage.initialize();
  }

  async login(credentials: PasswordCredentials) {
    // Authenticate with server
    const response = await fetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });

    const { token } = await response.json();

    // Store token locally
    await this.storage.setToken(token);
  }

  async logout() {
    // Remove token from local storage
    await this.storage.removeToken();
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.storage.getToken();
    return !!token;
  }
}
```

## Implements

- [`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md)

## Constructors

### Constructor

> **new IndexedDbAuthStorageAdapter**(`tenantId`): `IndexedDbAuthStorageAdapter`

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:139](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L139)

Creates a new IndexedDbAuthStorageAdapter instance.

#### Parameters

##### tenantId

`string` = `""`

Optional tenant identifier for multi-tenant isolation
                  When provided, creates a separate database prefixed with tenant ID

#### Returns

`IndexedDbAuthStorageAdapter`

#### Example

```typescript
// Default database (authStore)
const adapter = new IndexedDbAuthStorageAdapter();

// Tenant-specific database (authStore_org-123)
const tenantAdapter = new IndexedDbAuthStorageAdapter('org-123');
```

## Properties

### tenantId

> `readonly` **tenantId**: `string` = `""`

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:139](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L139)

Optional tenant identifier for multi-tenant isolation
                  When provided, creates a separate database prefixed with tenant ID

## Methods

### getUsername()

> **getUsername**(): `Promise`\<`string`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:153](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L153)

Retrieves the stored username.

Returns the single stored username, or an empty string if no username is stored.
This method retrieves the username stored with a fixed key, ensuring only one username is maintained.

#### Returns

`Promise`\<`string`\>

The stored username, or empty string if no username exists

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`getUsername`](../interfaces/AuthStorageAdapter.md#getusername)

***

### getToken()

> **getToken**(): `Promise`\<`null` \| \{ `provider`: `string`; `token`: `string`; \}\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:184](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L184)

Retrieves the first available authentication token.

Returns the first token found in the database, or null if no tokens are stored.
This method is typically called to get any available token for authentication.

#### Returns

`Promise`\<`null` \| \{ `provider`: `string`; `token`: `string`; \}\>

The first available token with provider information, or null if no tokens exist

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`getToken`](../interfaces/AuthStorageAdapter.md#gettoken)

***

### removeAllTokens()

> **removeAllTokens**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:225](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L225)

Removes all stored authentication tokens from IndexedDB.

Clears all stored tokens, effectively logging out all users.
This method is typically called during logout or when tokens expire.

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized or token removal fails

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`removeAllTokens`](../interfaces/AuthStorageAdapter.md#removealltokens)

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:253](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L253)

Closes the IndexedDB connection and cleans up resources.

For IndexedDB, connections are automatically managed by the browser,
so this method is a no-op but maintained for interface compatibility.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`closeConnection`](../interfaces/AuthStorageAdapter.md#closeconnection)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:276](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L276)

Initializes the IndexedDB database with required object stores for token storage.

Creates:
- Main "tokens" object store with token as the primary data
- Indexes for fast lookups: token, timestamp
- Proper error handling for database creation and upgrades

This method must be called before any other operations.

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not supported or database creation fails

#### Example

```typescript
const adapter = new IndexedDbAuthStorageAdapter('tenant-123');
await adapter.initialize();
// Now ready for token operations
```

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`initialize`](../interfaces/AuthStorageAdapter.md#initialize)

***

### getTokenByProvider()

> **getTokenByProvider**(`provider`): `Promise`\<`string`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:309](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L309)

Retrieves a stored authentication token by key.

Returns the token associated with the specified key, or an empty string if no token is found.
This method is typically called before making authenticated API requests.

#### Parameters

##### provider

`string` = `"current_token"`

The provider name identifying the token to retrieve

#### Returns

`Promise`\<`string`\>

The stored authentication token, or empty string if not found

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`getTokenByProvider`](../interfaces/AuthStorageAdapter.md#gettokenbyprovider)

***

### setUsername()

> **setUsername**(`username`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:351](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L351)

Stores a username in IndexedDB.

Saves the provided username with a fixed key, replacing any previously stored username.
This method ensures only one username is maintained at a time.
This method is typically called during login to store the authenticated user's username.

#### Parameters

##### username

`string`

The username to store

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized, invalid parameters provided, or username storage fails

#### Example

```typescript
// Store username (replaces any existing username)
await adapter.setUsername('john.doe@example.com');

// Store a different username (replaces the previous one)
await adapter.setUsername('jane.smith@example.com');
```

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`setUsername`](../interfaces/AuthStorageAdapter.md#setusername)

***

### setToken()

> **setToken**(`key`, `token`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:391](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L391)

Stores an authentication token with a specific key in IndexedDB.

Saves the provided token with the specified key and a timestamp for tracking purposes.
If a token already exists with the same key, it will be replaced with the new token.

#### Parameters

##### key

`string`

The key to associate with the token

##### token

`string`

The authentication token to store (JWT, Bearer token, etc.)

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized or token storage fails

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`setToken`](../interfaces/AuthStorageAdapter.md#settoken)

***

### removeToken()

> **removeToken**(`key`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:434](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L434)

Removes a specific authentication token by key from IndexedDB.

Removes the token associated with the specified key.
This method is typically called during logout or when tokens expire.

#### Parameters

##### key

`string`

The key identifying the token to remove

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized or token removal fails

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`removeToken`](../interfaces/AuthStorageAdapter.md#removetoken)

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:473](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L473)

Clears all authentication data from the store.

⚠️ **WARNING**: This permanently deletes all stored tokens!
Only use for testing or when intentionally clearing all authentication data.

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized or clear operation fails

#### Example

```typescript
// For testing environments only
if (process.env.NODE_ENV === 'test') {
  await adapter.clearStore();
  console.log('Authentication data cleared for testing');
}
```

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`clearStore`](../interfaces/AuthStorageAdapter.md#clearstore)
