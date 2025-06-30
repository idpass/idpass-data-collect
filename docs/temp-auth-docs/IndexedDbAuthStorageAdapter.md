[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / IndexedDbAuthStorageAdapter

# Class: IndexedDbAuthStorageAdapter

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:12](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L12)

IndexedDB-based implementation of the AuthStorageAdapter interface for storing authentication tokens in web browsers.
This adapter provides persistent storage for authentication tokens using the browser's IndexedDB API.

Key features:
- **Persistent Storage**: Tokens survive browser refreshes and restarts
- **Provider-based Storage**: Separate storage for different auth providers
- **Secure Storage**: Tokens are stored in the protected IndexedDB space
- **Async Operations**: Non-blocking database operations
- **Auto Database Creation**: Automatic database and store initialization

Architecture:
- Uses IndexedDB for persistent storage
- Implements AuthStorageAdapter interface
- Maintains separate stores for different providers
- Handles database versioning and upgrades

## Examples

Basic usage:
```typescript
const authStorage = new IndexedDbAuthStorageAdapter();
await authStorage.initialize();

// Store a token
await authStorage.setToken('auth0', 'bearer-token-123');

// Retrieve a token
const token = await authStorage.getTokenByProvider('auth0');
console.log('Auth0 token:', token);

// Remove a token
await authStorage.removeToken('auth0');

// Clear all tokens
await authStorage.removeAllTokens();
```

Integration with AuthManager:
```typescript
const authStorage = new IndexedDbAuthStorageAdapter();
await authStorage.initialize();

const authManager = new AuthManager(
  [{
    type: 'auth0',
    domain: 'your-domain.auth0.com',
    clientId: 'your-client-id'
  }],
  'https://api.example.com',
  authStorage
);

await authManager.initialize();
```

Error handling:
```typescript
try {
  const authStorage = new IndexedDbAuthStorageAdapter();
  await authStorage.initialize();
} catch (error) {
  if (error.name === 'QuotaExceededError') {
    console.error('Storage quota exceeded');
  } else if (error.name === 'SecurityError') {
    console.error('Security error accessing IndexedDB');
  } else {
    console.error('Failed to initialize auth storage:', error);
  }
}
```

## Implements

- [`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md)

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:25](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L25)

Initializes the IndexedDB database and creates necessary object stores.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`initialize`](../interfaces/AuthStorageAdapter.md#initialize)

#### Example

```typescript
const authStorage = new IndexedDbAuthStorageAdapter();
await authStorage.initialize();
```

***

### getTokenByProvider()

> **getTokenByProvider**(`provider`): `Promise`\<`string` | `null`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:45](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L45)

Retrieves a token for the specified authentication provider.

#### Parameters

##### provider

`string`

The authentication provider identifier

#### Returns

`Promise`\<`string` | `null`\>

The stored token or null if not found

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`getTokenByProvider`](../interfaces/AuthStorageAdapter.md#gettokenbyprovider)

#### Example

```typescript
const token = await authStorage.getTokenByProvider('auth0');
if (token) {
  console.log('Found token:', token);
} else {
  console.log('No token found');
}
```

***

### setToken()

> **setToken**(`provider`, `token`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:65](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L65)

Stores a token for the specified authentication provider.

#### Parameters

##### provider

`string`

The authentication provider identifier

##### token

`string`

The token to store

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`setToken`](../interfaces/AuthStorageAdapter.md#settoken)

#### Example

```typescript
await authStorage.setToken('auth0', 'bearer-token-123');
```

***

### removeToken()

> **removeToken**(`provider`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:85](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L85)

Removes the token for the specified authentication provider.

#### Parameters

##### provider

`string`

The authentication provider identifier

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`removeToken`](../interfaces/AuthStorageAdapter.md#removetoken)

#### Example

```typescript
await authStorage.removeToken('auth0');
```

***

### removeAllTokens()

> **removeAllTokens**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:105](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L105)

Removes all stored authentication tokens.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`removeAllTokens`](../interfaces/AuthStorageAdapter.md#removealltokens)

#### Example

```typescript
await authStorage.removeAllTokens();
```

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbAuthStorageAdapter.ts:125](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbAuthStorageAdapter.ts#L125)

Closes the database connection and performs cleanup.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md).[`closeConnection`](../interfaces/AuthStorageAdapter.md#closeconnection)

#### Example

```typescript
await authStorage.closeConnection();
``` 