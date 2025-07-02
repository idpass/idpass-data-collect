# Keycloak Adapter

The Keycloak adapter enables authentication integration with [Keycloak](https://www.keycloak.org/), an open-source identity and access management solution. This adapter allows you to implement secure authentication flows in IDPass DataCollect using Keycloak's OpenID Connect (OIDC) services.

## Configuration Requirements

The Keycloak adapter requires the following configuration in your authentication config:

```json
{
  "type": "keycloak",
  "fields": {
    "authority": "https://your-keycloak-server.com/realms/your-realm",
    "client_id": "YOUR_CLIENT_ID",
    "redirect_uri": "http://localhost:3000/callback",
    "response_type": "code",
    "scope": "openid profile email"
  }
}
```

## Configuration Parameters

### Required Fields

- `type`: Must be set to `"keycloak"` (required)
- `authority`: The Keycloak realm URL where authentication requests are sent (required)
  - Format: `https://your-keycloak-server.com/realms/your-realm`
- `client_id`: Keycloak client ID from your Keycloak realm settings (required)
- `redirect_uri`: OAuth callback URL where users are redirected after authentication (required)

### Optional Fields

| Field Name                  | Description                               | Default Value              | Notes                                                    |
| --------------------------- | ----------------------------------------- | -------------------------- | -------------------------------------------------------- |
| `realm`                     | Keycloak realm name                       | None                       | Automatically moved to `extraQueryParams`               |
| `post_logout_redirect_uri`  | URL to redirect after logout             | None                       | Automatically moved to `extraQueryParams`               |
| `response_type`             | OAuth 2.0 response type                  | `"code"`                   | Use "code" for authorization code flow                  |
| `scope`                     | OAuth 2.0 scopes to request              | `"openid profile email"`   | Space-separated list of scopes                          |          |
| `extraQueryParams`          | Additional OAuth query parameters        | `{}`                       | JSON string containing additional parameters             |

### Automatic Field Transformation

The Keycloak adapter automatically transforms configuration fields using the `transformConfig` method:

- **Standard Fields**: OAuth/OIDC standard fields are preserved as main configuration fields
- **Non-Standard Fields**: Any additional fields are automatically moved to `extraQueryParams`
- **Field Replacement**: If `extraQueryParams` is already provided, it will be **replaced** (not merged) with the auto-generated parameters

**Standard Fields (preserved as main config):**
- `client_id`
- `domain`, `issuer`, `authority`
- `redirect_uri`, `scope`, `scopes`
- `audience`, `responseType`, `response_type`

**Non-Standard Fields (automatically moved to extraQueryParams):**
- `realm`
- `post_logout_redirect_uri`
- Any custom fields you add

## Example Configuration

Here's a complete example configuration for a Keycloak realm:

```json
{
  "type": "keycloak",
  "fields": {
    "authority": "https://keycloak.example.com/realms/myapp",
    "client_id": "datacollect-client",
    "redirect_uri": "https://myapp.example.com/callback",
    "response_type": "code",
    "scope": "openid profile email roles",
    "realm": "myapp",
    "post_logout_redirect_uri": "https://myapp.example.com/login",
  }
}
```

**Note**: The `realm` and `post_logout_redirect_uri` fields will be automatically moved to `extraQueryParams` by the adapter's `transformConfig` method, resulting in:

```json
{
  "type": "keycloak",
  "fields": {
    "authority": "https://keycloak.example.com/realms/myapp",
    "client_id": "datacollect-client",
    "redirect_uri": "https://myapp.example.com/callback",
    "response_type": "code",
    "scope": "openid profile email roles",
    "extraQueryParams": "{\"realm\":\"myapp\",\"post_logout_redirect_uri\":\"https://myapp.example.com/login\"}"
  }
}
```

## Configuration via Admin Interface

When using the IDPass DataCollect admin interface to configure the Keycloak adapter:

1. Set **Type** to "Keycloak"
2. Fill in the required **Fields**:
   - **authority**: `https://your-keycloak-server.com/realms/your-realm`
   - **client_id**: `your-keycloak-client-id`
   - **redirect_uri**: `your-callback-url`
3. Add optional fields as needed:
   - **realm**: Keycloak realm name (automatically moved to extraQueryParams)
   - **post_logout_redirect_uri**: Logout redirect URL (automatically moved to extraQueryParams)
   - **scope**: To request additional permissions (e.g., "openid profile email roles")
   - **extraQueryParams**: For advanced OAuth parameters (will be replaced if other non-standard fields are present)

**Important**: If you manually set `extraQueryParams` and also provide other non-standard fields (like `realm`), the manually set `extraQueryParams` will be **replaced** by the auto-generated ones.

## Current Capabilities

✅ **OIDC Authentication**: Full OpenID Connect authentication flow support

- Authorization code flow with PKCE
- Token validation via Keycloak's userinfo endpoint
- User profile retrieval with Keycloak-specific claims
- Role-based access control with Keycloak roles

✅ **Session Management**: Comprehensive session handling

- Secure token storage via storage adapters
- Session restoration on application restart
- Proper logout with token cleanup
- Integration with `SingleAuthStorage` interface

✅ **Security Features**: Enterprise-grade security implementation

- **Dual Validation Mode**: Different token validation for frontend vs backend environments
- **Role Validation**: Automatic validation of user roles from Keycloak token claims
- **Environment Detection**: Automatic detection of frontend/backend context using `window` object
- **Userinfo Endpoint Validation**: Server-side token validation using Keycloak's `/userinfo` endpoint
- **Client-side Token Matching**: Frontend validation by comparing stored tokens

✅ **Advanced Configuration**: Flexible configuration handling

- **Automatic Field Transformation**: Non-standard fields automatically moved to `extraQueryParams`
- **Field Replacement**: Automatic generation of `extraQueryParams` from non-standard fields
- **Standards Compliance**: Proper separation of OAuth/OIDC standard fields

## Authentication Flow

The Keycloak adapter implements the following authentication flow:

1. **Initialization**: Configure OIDC client with Keycloak realm and application settings
2. **Login Redirect**: Redirect user to Keycloak login page
3. **Authentication**: User authenticates with Keycloak (username/password, LDAP, social, etc.)
4. **Callback Handling**: Process OAuth callback and exchange code for tokens
5. **Token Storage**: Securely store access tokens via `SingleAuthStorage`
6. **Token Validation**: Validate tokens using appropriate method based on environment

## Token Validation Logic

The adapter implements environment-aware token validation:

### Server-side Validation (`validateTokenServer`)
- Uses Keycloak's `/userinfo` endpoint for token validation
- Validates user roles and permissions from token claims
- Checks realm-specific user information
- 5-second timeout for validation requests

### Client-side Validation (`validateTokenClient`)
- Compares provided token with stored authentication token
- Faster validation for browser environments
- Relies on stored authentication state

## Usage Examples

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

// Handle OAuth callback
await keycloakAdapter.handleCallback();

// Logout
await keycloakAdapter.logout();
```

### Realm-specific Authentication

```typescript
const config = {
  type: "keycloak",
  fields: {
    authority: "https://keycloak.example.com/realms/myapp",
    client_id: "datacollect-client",
    redirect_uri: "http://localhost:3000/callback",
    realm: "myapp" // Automatically moved to extraQueryParams
  }
};

const keycloakAdapter = new KeycloakAuthAdapter(storage, config);
```

### Token Validation

```typescript
// Validate token (uses environment-appropriate validation)
const token = "eyJhbGciOiJSUzI1...";
const isValid = await keycloakAdapter.validateToken(token);
```

## API Reference

### Methods

#### initialize()
```typescript
async initialize(): Promise<void>
```
Initializes the adapter and restores any existing session using OIDC client.

#### isAuthenticated()
```typescript
async isAuthenticated(): Promise<boolean>
```
Checks if the user has a valid Keycloak session by verifying stored access token.

#### login()
```typescript
async login(): Promise<{ username: string; token: string }>
```
Initiates Keycloak login flow and returns user credentials from profile.

#### logout()
```typescript
async logout(): Promise<void>
```
Logs out the user from Keycloak and clears stored tokens from both OIDC client and auth storage.

#### validateToken()
```typescript
async validateToken(token: string): Promise<boolean>
```
Validates a Keycloak access token using environment-appropriate validation method.

#### handleCallback()
```typescript
async handleCallback(): Promise<void>
```
Processes Keycloak OAuth callback, stores tokens, and updates auth storage.

## Setup Steps

1. **Configure Keycloak Realm**: Set up a realm in your Keycloak server
2. **Create Keycloak Client**: Create an OpenID Connect client in your realm
3. **Configure Client Settings**: Set up redirect URIs and client authentication
4. **Configure IDPass DataCollect**: Add the Keycloak configuration to your authentication config
5. **Set Up Roles** (Optional): Configure Keycloak roles for role-based access control
6. **Test Integration**: Verify authentication flows work correctly

## Limitations

- Requires internet connectivity for authentication and token validation
- Role validation depends on proper Keycloak role configuration and token claims
- Server-side token validation has 5-second timeout limitation
- Some advanced Keycloak features may require additional configuration
- Manual `extraQueryParams` will be replaced if non-standard fields are present

## Troubleshooting

### Common Issues

**Authentication Redirect Errors**

- Verify the `redirect_uri` matches exactly what's configured in Keycloak client settings
- Check that the callback URL is properly whitelisted in Keycloak client configuration
- Ensure the `authority` URL is correct and includes the proper realm path
- Confirm the `client_id` exists in the specified Keycloak realm
- Verify the Keycloak server is accessible and running

**Token Validation Failures**

- Check that the token hasn't expired (verify token lifetime settings in Keycloak)
- Verify the `authority` URL for userinfo endpoint validation
- Ensure the client has proper permissions for userinfo endpoint
- Check network connectivity to Keycloak server
- Verify 5-second timeout isn't being exceeded
- Confirm the realm is properly configured and accessible

**Role-based Access Issues**

- Verify that user roles are properly assigned in Keycloak
- Check that role mappings are correctly configured
- Ensure roles are included in token claims
- Confirm the client scope includes role information
- Verify role validation logic matches your Keycloak role structure

**Configuration Issues**

- Ensure all required fields are present in the configuration
- Check that field names match exactly (case-sensitive)
- Confirm the `type` field is set to `"keycloak"`
- Verify the authority URL format: `https://server/realms/realm-name`
- Check that automatic field transformation is working correctly
- Verify non-standard fields are being moved to `extraQueryParams`
- Be aware that manual `extraQueryParams` will be replaced by auto-generated ones

**Client Configuration Problems**

- Verify client type is set correctly (public vs confidential)
- Check that client authentication is properly configured
- Ensure redirect URIs are exactly matching (including trailing slashes)
- Confirm client protocol is set to "openid-connect"
- Verify client scopes include necessary permissions

**Session Management Problems**

- Check that the storage adapter is properly initialized
- Verify token storage and retrieval functionality
- Ensure proper cleanup on logout
- Check for browser storage limitations or restrictions


## Security Considerations

- **HTTPS Only**: Always use HTTPS in production environments
- **Token Security**: Tokens are stored securely using the configured storage adapter
- **Role Validation**: Automatic validation of user roles from Keycloak token claims
- **Environment Isolation**: Different validation methods for frontend vs backend environments
- **Timeout Protection**: 5-second timeout on userinfo validation requests
- **Error Handling**: Secure error handling that doesn't expose sensitive authentication details
- **Logout Cleanup**: Comprehensive token cleanup on logout from both OIDC client and auth storage

## Best Practices

1. **Realm Configuration**: Use dedicated realms for different environments (dev, staging, prod)
2. **Client Setup**: Configure clients with appropriate security settings and minimal required permissions
3. **Role Management**: Implement proper role-based access control using Keycloak roles
4. **Token Management**: Implement proper token refresh and expiration handling
5. **Error Handling**: Provide user-friendly error messages for authentication failures
6. **Security Headers**: Implement proper CORS and security headers
7. **Monitoring**: Implement logging and monitoring for authentication events
8. **Testing**: Thoroughly test authentication flows in different scenarios
9. **Configuration Validation**: Verify that automatic field transformation works as expected
10. **extraQueryParams Handling**: Be aware that manual `extraQueryParams` will be replaced if non-standard fields are present

## Support

For issues specific to the Keycloak adapter, please check:

- Keycloak documentation: https://www.keycloak.org/documentation
- Keycloak community: https://www.keycloak.org/community
- IDPass DataCollect GitHub issues for adapter-specific problems 