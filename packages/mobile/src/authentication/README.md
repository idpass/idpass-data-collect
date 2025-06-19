# Authentication Module

This module provides a flexible OpenID Connect (OIDC) authentication solution for web and Capacitor-based mobile applications. It supports multiple authentication providers and handles the complexities of OIDC flows, token management, and platform-specific redirect handling.

## Features

- **OIDC Standard**: Implements OIDC for secure authentication.
- **Multiple Provider Support**: Easily extendable to support various OIDC-compliant providers. Comes with pre-built support for Auth0 and Keycloak.
- **Provider Registry**: A central registry to manage and access different authentication providers.
- **Web and Mobile (Capacitor)**: Handles authentication flows for both web applications and native mobile applications built with Capacitor, including deep linking for callbacks.
- **Customizable Configuration**: Allows detailed configuration for each provider, including custom parameters.
<!-- * **Token Management**: Handles fetching, storing, and validating access tokens and ID tokens. -->

<!-- * **Callback Handling**: Manages OIDC redirect callbacks after successful or failed authentication attempts. -->
<!-- * **Logout Functionality**: Provides methods for logging out and clearing user sessions. -->
<!-- * **State Management**: Uses `localStorage` for storing authentication state, redirect URLs, and last used provider.
* **Helper Utilities**: Includes utility functions for common tasks like generating redirect URIs and validating tokens. -->

## File Structure

```
authentication/
├── setup.ts                  # Main setup, initialization, and callback handling logic for providers.
├── index.ts                  # Core OIDCAuthService class and type definitions (OIDCConfig, AuthResult).
├── AuthProvider.ts           # Defines the AuthProvider interface and ProviderRegistry.
├── authUtils.ts              # Utility functions for login handling, redirect URIs, token validation, and localStorage keys.
└── providers/
    ├── KeycloakProvider.ts   # AuthProvider implementation for Keycloak.
    └── Auth0Provider.ts      # AuthProvider implementation for Auth0.
```

## Core Components

### `OIDCAuthService` (in `index.ts`)

This is the central class responsible for handling OIDC authentication flows. It uses the `oidc-client-ts` library.

- **Constructor**: Takes an `OIDCConfig` object.
- **`login()`**: Initiates the sign-in redirect flow.
- **`handleCallback()`**: Processes the redirect from the OIDC provider, exchanges the authorization code for tokens, and stores them.
- **`logout()`**: Clears the user session and redirects to the post-logout URI.
- **`getStoredAuth()`**: Retrieves the stored authentication result (tokens, profile) for the current user.

### `AuthProvider` and `ProviderRegistry` (in `AuthProvider.ts`)

- **`AuthProvider` Interface**: Defines the contract for an authentication provider. Each provider must implement:
  - `name`: Name of the provider (e.g., "Auth0", "Keycloak").
  - `description`: A brief description.
  - `createConfig(config: AuthProviderConfig): OIDCConfig`: Creates the OIDC configuration specific to the provider.
  - `initialize(config: AuthProviderConfig, authServices: Record<string, OIDCAuthService>): OIDCAuthService | null`: Initializes the provider and its associated `OIDCAuthService`.
- **`ProviderRegistry`**: A static class to register and retrieve `AuthProvider` instances.
  - `register(name: string, provider: AuthProvider)`: Adds a provider to the registry.
  - `get(name: string): AuthProvider | undefined`: Retrieves a provider by name.
  - `getAll(): AuthProvider[]`: Returns all registered providers.

## Providers

The module includes implementations for the following OIDC providers:

### Auth0 (`providers/Auth0Provider.ts`)

- Implements the `AuthProvider` interface for Auth0.
- Constructs the `OIDCConfig` using Auth0 specific details like domain and allows for custom parameters.

### Keycloak (`providers/KeycloakProvider.ts`)

- Implements the `AuthProvider` interface for Keycloak.
- Constructs the `OIDCConfig` using Keycloak specific details like the server URL and realm.

## Setup and Initialization (`setup.ts`)

The `setup.ts` file orchestrates the initialization and runtime behavior of the authentication module.

- **Provider Registration**: Auth0 and Keycloak providers are registered with the `ProviderRegistry` upon module load.
- **`setupAuthHandling(service: OIDCAuthService, handlers: AuthHandlers)`**:
  - Sets up listeners for `appUrlOpen` event in Capacitor to handle redirect URIs on mobile platforms.
  - Wraps the `OIDCAuthService.handleCallback` method to invoke `onAuthSuccess` or `onAuthError` handlers.
- **`initializeProviders(authConfig: any, loadingStates: any, currentAppId: any, authServices: Record<string, OIDCAuthService>)`**:
  - Iterates through all registered providers.
  - If a configuration exists for a provider in `authConfig`, it initializes the provider.
  - Calls `setupAuthHandling` for each initialized service.
  - On successful authentication:
    - Updates loading states.
    - Stores the last used authentication provider and app ID.
    - Determines and performs the redirect.
    - Cleans up temporary authentication storage items.
  - On authentication error:
    - Updates loading states.
    - Logs the error.

## Utility Functions (`authUtils.ts`)

This file provides several helper functions:

- **`AUTH_FIELD_KEYS`**: An object containing keys used for `localStorage` items (e.g., `last_auth_provider`, `auth_redirect_url`).
- **`handleLogin(provider: string, service: OIDCAuthService, appId: string, redirectUrl: string, loadingStates?: Ref<Record<string, boolean>>)`**:
  - Stores necessary information in `localStorage` (current app ID, last auth provider, redirect URL).
  - Calls the `login()` method of the provided `OIDCAuthService`.
  - Manages loading states if provided.
- **`getRedirectUri(webUrl: string, appScheme: string): string`**: Returns the appropriate redirect URI based on whether the app is running on a native platform (Capacitor) or web.
- **`getPostLogoutUri(webUrl: string, appScheme: string): string`**: Returns the appropriate post-logout redirect URI.
- **`isTokenValid(token: string): boolean`**: Decodes a JWT and checks if it has expired.

## Key LocalStorage Items

The module utilizes `localStorage` to maintain state across browser sessions and application restarts:

- **`AUTH_FIELD_KEYS.last_auth_provider`**: Stores the name of the last successfully used authentication provider (e.g., "auth0", "keycloak"). Appended with `_appId` for multi-app scenarios.
- **`AUTH_FIELD_KEYS.last_auth_app_id`**: Stores the ID of the application for which the last authentication was performed.
- **`AUTH_FIELD_KEYS.current_app_id`**: Temporarily stores the app ID during an active login flow.
- **`AUTH_FIELD_KEYS.auth_redirect_url`**: Stores the URL to redirect to after a successful authentication.
- **OIDC Client Storage**: The `oidc-client-ts` library itself uses `localStorage` (configured via `WebStorageStateStore`) to store OIDC protocol-related state, user information, and tokens.

## How to Use (Conceptual)

### 1. Configure Providers

Provide an `authConfig` object where keys are provider names (e.g., "auth0", "keycloak") and values are their respective `AuthProviderConfig` objects. This config would include details like `clientId`, `authority` (or `domain`/`url`+`realm`), redirect URIs, scopes, etc.

```typescript
const authConfig = {
  auth0: {
    enabled: true,
    domain: 'your-auth0-domain.auth0.com',
    clientId: 'your-auth0-client-id',
    webAppURL: 'http://localhost:3000/callback',
    appCallbackURL: 'com.yourapp.id://callback',
    webAppLogoutURL: 'http://localhost:3000/logout',
    appLogoutURL: 'com.yourapp.id://logout',
    scope: 'openid profile email',
    custom: {
      organization: 'your-organization'
    }
  },
  keycloak: {
    enabled: true,
    url: 'your-keycloak-url',
    realm: 'your-realm',
    clientId: 'your-keycloak-client-id',
    webAppURL: 'http://localhost:3000/callback',
    appCallbackURL: 'com.yourapp.id://callback',
    webAppLogoutURL: 'http://localhost:3000/logout',
    appLogoutURL: 'com.yourapp.id://logout',
    scope: 'openid profile email'
  }
}
```

### 2. Initialize

Call `initializeProviders` with the `authConfig`, refs for loading states (if using a reactive framework like Vue), the current application ID, and an object to hold the initialized `OIDCAuthService` instances.

```typescript
import { initializeProviders } from './authentication/setup'

const loadingStates = ref({})
const currentAppId = ref('your-app-id')
const authServices = {}

initializeProviders(authConfig, loadingStates, currentAppId, authServices)
```

### 3. Login

- Identify the desired provider (e.g., from user selection).
- Retrieve the corresponding `OIDCAuthService` instance.
- Call `handleLogin` from `authUtils.ts`, passing the provider name, service instance, app ID, and desired redirect URL.

```typescript
import { handleLogin } from './authentication/authUtils'

const providerName = 'auth0'
const service = authServices[providerName]
const redirectUrl = '/dashboard'

try {
  await handleLogin(providerName, service, currentAppId.value, redirectUrl, loadingStates)
} catch (error) {
  console.error('Login failed:', error)
}
```

### 4. Handle Callbacks

The `setupAuthHandling` function (called during `initializeProviders`) will automatically handle the callback from the OIDC provider. It will invoke the `onAuthSuccess` or `onAuthError` handlers you define. `onAuthSuccess` typically redirects the user.

### 5. Access User Information/Tokens

After successful login, use the `getStoredAuth()` method of the active `OIDCAuthService` to retrieve user tokens and profile information.

```typescript
const authResult = await authServices['auth0'].getStoredAuth()
if (authResult) {
  console.log('User profile:', authResult.profile)
  console.log('Access token:', authResult.access_token)
}
```

### 6. Logout

Call the `logout()` method of the active `OIDCAuthService`.

```typescript
await authServices['auth0'].logout()
```

## Dependencies

This module requires the following dependencies:

- `oidc-client-ts`: Core OIDC client functionality
- `@capacitor/app`: For mobile app URL handling
- `@capacitor/core`: Capacitor core functionality
- `jwt-decode`: For JWT token validation

```bash
npm install oidc-client-ts @capacitor/app @capacitor/core jwt-decode
```

## Adding Custom Providers

To add support for a new OIDC provider:

1. Create a new class implementing the `AuthProvider` interface
2. Register it with the `ProviderRegistry`
3. Add the provider configuration to your `authConfig`

```typescript
// Example: MyCustomProvider.ts
import { AuthProvider, AuthProviderConfig } from '../AuthProvider'
import { OIDCConfig, OIDCAuthService } from '../index'
import { getRedirectUri, getPostLogoutUri } from '../authUtils'

export class MyCustomProvider implements AuthProvider {
  name = 'MyCustomProvider'
  description = 'A custom OIDC provider'

  createConfig(config: AuthProviderConfig): OIDCConfig {
    return {
      authority: config.authority,
      client_id: config.clientId,
      redirect_uri: getRedirectUri(config.webAppURL, config.appCallbackURL),
      post_logout_redirect_uri: getPostLogoutUri(config.webAppLogoutURL, config.appLogoutURL),
      response_type: 'code',
      scope: config.scope
    }
  }

  initialize(
    config: AuthProviderConfig,
    authServices: Record<string, OIDCAuthService>
  ): OIDCAuthService | null {
    if (!config.enabled) return null

    const service = new OIDCAuthService(this.createConfig(config))
    authServices[this.name.toLowerCase()] = service
    return service
  }
}

// Register the provider
import { ProviderRegistry } from './AuthProvider'
ProviderRegistry.register('mycustomprovider', new MyCustomProvider())
```
