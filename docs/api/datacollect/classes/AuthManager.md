[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / AuthManager

# Class: AuthManager

Defined in: [components/AuthManager.ts:36](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L36)

Authentication manager that handles multiple authentication providers and methods.

The AuthManager provides a unified interface for handling different authentication providers
including Auth0, Keycloak, and default username/password authentication. It manages token
storage, provider-specific authentication flows, and session state.

Key features:
- **Multiple Providers**: Support for Auth0, Keycloak, and default authentication
- **Token Management**: Secure storage and validation of authentication tokens
- **OAuth Integration**: Handles OAuth2/OIDC flows for supported providers
- **Session Management**: Unified session handling across providers
- **Flexible Storage**: Pluggable storage adapters for token persistence

Architecture:
- Uses adapter pattern for different authentication providers
- Supports pluggable storage for token persistence
- Implements provider-agnostic authentication interface
- Handles both OAuth and traditional authentication flows

## Examples

Basic usage:
```typescript
const authManager = new AuthManager(
  [{
    type: 'auth0',
    domain: 'your-domain.auth0.com',
    clientId: 'your-client-id'
  }],
  'https://api.example.com',
  new LocalStorageAdapter()
);

await authManager.initialize();

// Check authentication status
const isAuth = await authManager.isAuthenticated();
console.log('Is authenticated:', isAuth);
```

Provider-specific login:
```typescript
// Auth0 login
await authManager.login(null, 'auth0');

// Default username/password login
await authManager.login({
  username: 'user@example.com',
  password: 'password'
});
```

Token validation:
```typescript
const token = 'bearer-token';
const isValid = await authManager.validateToken('auth0', token);

if (isValid) {
  console.log('Token is valid');
} else {
  console.log('Token is invalid or expired');
}
```

OAuth callback handling:
```typescript
// Handle OAuth redirect callback
window.onload = async () => {
  if (window.location.search.includes('code=')) {
    await authManager.handleCallback('auth0');
    // Redirect to app
    window.location.href = '/dashboard';
  }
};
```

## Integration with EntityDataManager

The AuthManager can be used in conjunction with EntityDataManager to handle authenticated data operations. This integration ensures that data operations are performed with proper authentication and authorization.

### Basic Setup

```typescript
// Initialize stores and services
const eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
const entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
const authStorage = new IndexedDbAuthStorageAdapter();

// Initialize auth manager
const authManager = new AuthManager(
  [{ type: "auth0", domain: "your-domain.auth0.com", clientId: "your-client-id" }],
  "https://api.example.com",
  authStorage
);

// Initialize sync managers
const internalSyncManager = new InternalSyncManager(
  eventStore,
  entityStore,
  eventApplierService,
  "https://api.example.com",
  authStorage
);

const externalSyncManager = new ExternalSyncManager(eventStore, eventApplierService, {
  type: "sync-server",
  url: "https://external-sync.example.com",
  extraFields: []
});

// Create entity manager with auth manager
const entityManager = new EntityDataManager(
  eventStore,
  entityStore,
  eventApplierService,
  externalSyncManager,
  internalSyncManager,
  authManager
);

// Initialize all components
await Promise.all([
  eventStore.initialize(),
  entityStore.initialize(),
  authStorage.initialize(),
  authManager.initialize()
]);
```


### Syncing Data

```typescript
// Check for unsynced events
if (await entityManager.hasUnsyncedEvents()) {
  // Ensure authenticated
  if (await authManager.isAuthenticated()) {
    try {
      // Sync with server
      await entityManager.syncWithSyncServer();
      console.log('Sync completed');
    } catch (error) {
      if (error.message === 'Unauthorized') {
        // Handle authentication error
        await authManager.login({
          username: "admin@example.com",
          password: "password"
        });
        // Retry sync
        await entityManager.syncWithSyncServer();
      }
    }
  }
}
```

## Constructors

### Constructor

> **new AuthManager**(`configs`, `syncServerUrl`, `authStorage?`): `AuthManager`

Defined in: [components/AuthManager.ts:42](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L42)

Creates a new AuthManager instance.

#### Parameters

##### configs

`AuthConfig[]`

Array of authentication provider configurations

##### syncServerUrl

`string`

URL of the sync server for default authentication

##### authStorage?

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md)

Optional storage adapter for auth tokens

#### Returns

`AuthManager`

#### Example

```typescript
const configs = [{
  type: 'auth0',
  domain: 'your-domain.auth0.com',
  clientId: 'your-client-id'
}, {
  type: 'keycloak',
  url: 'https://keycloak.example.com',
  realm: 'your-realm',
  clientId: 'your-client-id'
}];

const authManager = new AuthManager(
  configs,
  'https://api.example.com',
  new LocalStorageAdapter()
);
```

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:48](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L48)

Initializes authentication adapters based on provided configurations.

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await authManager.initialize();
```

***

### isAuthenticated()

> **isAuthenticated**(): `Promise`\<`boolean`\>

Defined in: [components/AuthManager.ts:65](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L65)

Checks if user is authenticated through any provider.

#### Returns

`Promise`\<`boolean`\>

#### Throws

`Error` - When auth storage is not set

#### Example

```typescript
const isAuth = await authManager.isAuthenticated();
if (isAuth) {
  console.log('User is authenticated');
}
```

***

### login()

> **login**(`credentials`, `type?`): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:82](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L82)

Authenticates user using specified provider or default login.

#### Parameters

##### credentials

`PasswordCredentials` | `TokenCredentials` | `null`

Login credentials

##### type?

`string`

Authentication provider type

#### Returns

`Promise`\<`void`\>

#### Throws

`Error` - When auth storage is not set

#### Example

```typescript
// Provider login
await authManager.login(null, 'auth0');

// Default login
await authManager.login({
  username: 'user@example.com',
  password: 'password'
});
```

***

### logout()

> **logout**(): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:92](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L92)

Logs out from all authentication providers.

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await authManager.logout();
```

***

### validateToken()

> **validateToken**(`type`, `token`): `Promise`\<`boolean`\>

Defined in: [components/AuthManager.ts:98](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L98)

Validates token for specified authentication provider.

#### Parameters

##### type

`string`

Authentication provider type

##### token

`string`

Token to validate

#### Returns

`Promise`\<`boolean`\>

#### Example

```typescript
const isValid = await authManager.validateToken('auth0', token);
```

***

### handleCallback()

> **handleCallback**(`type`): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:102](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L102)

Handles OAuth callback for specified provider.

#### Parameters

##### type

`string`

Authentication provider type

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
await authManager.handleCallback('auth0');
``` 