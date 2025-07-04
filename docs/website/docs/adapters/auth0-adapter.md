# Auth0 Adapter

The Auth0 adapter enables authentication integration with [Auth0](https://auth0.com/), a flexible identity platform for developers. This adapter allows you to implement secure authentication flows in IDPass DataCollect using Auth0's OpenID Connect (OIDC) services.

## Configuration Requirements

The Auth0 adapter requires the following configuration in your authentication config:

```json
{
  "type": "auth0",
  "fields": {
    "authority": "https://example.auth0.com",
    "client_id": "YOUR_CLIENT_ID",
    "redirect_uri": "http://localhost:3000/callback",
    "response_type": "code",
    "scope": "openid profile email"
  }
}
```

## Configuration Parameters

### Required Fields

- `type`: Must be set to `"auth0"` (required)
- `authority`: The Auth0 domain URL where authentication requests are sent (required)
- `client_id`: Auth0 application client ID from your Auth0 dashboard (required)
- `redirect_uri`: OAuth callback URL where users are redirected after authentication (required)

### Optional Fields

| Field Name                  | Description                               | Default Value              | Notes                                                    |
| --------------------------- | ----------------------------------------- | -------------------------- | -------------------------------------------------------- |
| `post_logout_redirect_uri`  | URL to redirect after logout             | None                       | Automatically moved to `extraQueryParams`               |
| `response_type`             | OAuth 2.0 response type                  | `"code"`                   | Use "code" for authorization code flow                  |
| `scope`                     | OAuth 2.0 scopes to request              | `"openid profile email"`   | Space-separated list of scopes                          |
| `organization`              | Auth0 organization ID                    | None                       | Automatically moved to `extraQueryParams`               |
| `extraQueryParams`          | Additional OAuth query parameters        | `{}`                       | JSON string containing additional parameters             |

### Automatic Field Transformation

The Auth0 adapter automatically transforms configuration fields using the `transformConfig` method:

- **Standard Fields**: OAuth/OIDC standard fields are preserved as main configuration fields
- **Non-Standard Fields**: Any additional fields are automatically moved to `extraQueryParams`
- **Field Replacement**: If `extraQueryParams` is already provided, it will be **replaced** (not merged) with the auto-generated parameters

**Standard Fields (preserved as main config):**
- `client_id`
- `domain`, `issuer`, `authority`
- `redirect_uri`, `scope`, `scopes`
- `audience`, `responseType`, `response_type`

**Non-Standard Fields (automatically moved to extraQueryParams):**
- `post_logout_redirect_uri`
- `organization`
- Any custom fields you add

## Example Configuration

Here's a complete example configuration for an organizational user management system:

```json
{
  "type": "auth0",
  "fields": {
    "authority": "https://myorg.auth0.com",
    "client_id": "abc123def456ghi789",
    "redirect_uri": "https://myapp.example.com/callback",
    "response_type": "code",
    "scope": "openid profile email read:users",
    "post_logout_redirect_uri": "https://myapp.example.com/login",
    "organization": "org_abc123def456"
  }
}
```

**Note**: The `post_logout_redirect_uri` and `organization` fields will be automatically moved to `extraQueryParams` by the adapter's `transformConfig` method, resulting in:

```json
{
  "type": "auth0",
  "fields": {
    "authority": "https://myorg.auth0.com",
    "client_id": "abc123def456ghi789",
    "redirect_uri": "https://myapp.example.com/callback",
    "response_type": "code",
    "scope": "openid profile email read:users",
    "extraQueryParams": "{\"post_logout_redirect_uri\":\"https://myapp.example.com/login\",\"organization\":\"org_abc123def456\"}"
  }
}
```

## Configuration via Admin Interface

When using the IDPass DataCollect admin interface to configure the Auth0 adapter:

1. Set **Type** to "Auth0"
2. Fill in the required **Fields**:
   - **authority**: `https://your-domain.auth0.com`
   - **client_id**: `your-application-client-id`
   - **redirect_uri**: `your-callback-url`
3. Add optional fields as needed:
   - **post_logout_redirect_uri**: Logout redirect URL (automatically moved to extraQueryParams)
   - **organization**: For organization-specific authentication (automatically moved to extraQueryParams)
   - **scope**: To request additional permissions
   - **extraQueryParams**: For advanced OAuth parameters (will be replaced if other non-standard fields are present)

**Important**: If you manually set `extraQueryParams` and also provide other non-standard fields (like `organization`), the manually set `extraQueryParams` will be **replaced** by the auto-generated ones.

## Current Capabilities

✅ **OIDC Authentication**: Full OpenID Connect authentication flow support

- Authorization code flow with PKCE
- Token validation via Auth0's userinfo endpoint
- User profile retrieval
- Organization-based access control with validation

✅ **Session Management**: Comprehensive session handling

- Secure token storage via storage adapters
- Session restoration on application restart
- Proper logout with token cleanup
- Integration with `SingleAuthStorage` interface

✅ **Security Features**: Enterprise-grade security implementation

- **Dual Validation Mode**: Different token validation for frontend vs backend environments
- **Organization Validation**: Automatic validation of user's organization membership via `org_id` claim
- **Userinfo Endpoint Validation**: Server-side token validation using Auth0's `/userinfo` endpoint
- **Client-side Token Matching**: Frontend validation by comparing stored tokens

✅ **Advanced Configuration**: Flexible configuration handling

- **Automatic Field Transformation**: Non-standard fields automatically moved to `extraQueryParams`
- **Field Replacement**: Automatic generation of `extraQueryParams` from non-standard fields
- **Standards Compliance**: Proper separation of OAuth/OIDC standard fields

## Authentication Flow

The Auth0 adapter implements the following authentication flow:

1. **Initialization**: Configure Auth0 client with domain and application settings
2. **Login Redirect**: Redirect user to Auth0 login page
3. **Authentication**: User authenticates with Auth0 (username/password, social, etc.)
4. **Callback Handling**: Process OAuth callback and exchange code for tokens
5. **Token Storage**: Securely store access tokens via `SingleAuthStorage`
6. **Token Validation**: Validate tokens using appropriate method based on environment

## Token Validation Logic

The adapter implements environment-aware token validation:

### Server-side Validation (`validateTokenServer`)
- Uses Auth0's `/userinfo` endpoint for token validation
- Validates organization membership if `organization` field is configured
- Checks `org_id` claim against configured organization
- 5-second timeout for validation requests

### Client-side Validation (`validateTokenClient`)
- Compares provided token with stored authentication token
- Faster validation for browser environments
- Relies on stored authentication state

## Usage Examples

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
    redirect_uri: "http://localhost:3000/callback",
    organization: "org_123" // Automatically moved to extraQueryParams
  }
};

const auth0Adapter = new Auth0AuthAdapter(storage, config);
```

### Token Validation

```typescript
// Validate token (uses environment-appropriate validation)
const token = "eyJhbGciOiJSUzI1...";
const isValid = await auth0Adapter.validateToken(token);
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
Checks if the user has a valid Auth0 session by verifying stored access token.

#### login()
```typescript
async login(): Promise<{ username: string; token: string }>
```
Initiates Auth0 login flow and returns user credentials from profile.

#### logout()
```typescript
async logout(): Promise<void>
```
Logs out the user from Auth0 and clears stored tokens from both OIDC client and auth storage.

#### validateToken()
```typescript
async validateToken(token: string): Promise<boolean>
```
Validates an Auth0 access token using environment-appropriate validation method.

#### handleCallback()
```typescript
async handleCallback(): Promise<void>
```
Processes Auth0 OAuth callback, stores tokens, and updates auth storage.

## Setup Steps

1. **Create Auth0 Application**: Set up a Single Page Application in your Auth0 dashboard
2. **Configure Callback URLs**: Add your application's callback URLs to Auth0 settings
3. **Configure IDPass DataCollect**: Add the Auth0 configuration to your authentication config
4. **Set Up Organization** (Optional): Configure Auth0 Organizations for multi-tenant scenarios
5. **Test Integration**: Verify authentication flows work correctly

## Limitations

- Requires internet connectivity for authentication and token validation
- Organization validation requires Auth0 Organizations feature and proper `org_id` claims
- Server-side token validation has 5-second timeout limitation
- Some advanced Auth0 features may require additional configuration
- Manual `extraQueryParams` will be replaced if non-standard fields are present

## Troubleshooting

### Common Issues

**Authentication Redirect Errors**

- Verify the `redirect_uri` matches exactly what's configured in Auth0
- Check that the callback URL is properly whitelisted in Auth0 dashboard
- Ensure the `authority` URL is correct and accessible
- Confirm the `client_id` is valid and active

**Token Validation Failures**

- Check that the token hasn't expired
- Verify the `authority` URL for userinfo endpoint validation
- Ensure the client has proper permissions for userinfo endpoint
- Check network connectivity to Auth0 services
- Verify 5-second timeout isn't being exceeded

**Organization Authentication Issues**

- Verify the `organization` parameter matches the Auth0 Organization ID
- Check that the user is a member of the specified organization
- Ensure the user's token contains the `org_id` claim
- Confirm the client application has access to the organization
- Verify organization is properly configured in Auth0

**Configuration Issues**

- Ensure all required fields are present in the configuration
- Check that field names match exactly (case-sensitive)
- Confirm the `type` field is set to `"auth0"`
- Verify automatic field transformation is working correctly
- Check that non-standard fields are being moved to `extraQueryParams`
- Be aware that manual `extraQueryParams` will be replaced by auto-generated ones

**Session Management Problems**

- Check that the storage adapter is properly initialized
- Verify token storage and retrieval functionality
- Ensure proper cleanup on logout
- Check for browser storage limitations or restrictions


## Security Considerations

- **HTTPS Only**: Always use HTTPS in production environments
- **Token Security**: Tokens are stored securely using the configured storage adapter
- **Organization Validation**: Automatic validation of user's organization membership via `org_id` claim
- **Environment Isolation**: Different validation methods for frontend vs backend environments
- **Timeout Protection**: 5-second timeout on userinfo validation requests
- **Error Handling**: Secure error handling that doesn't expose sensitive authentication details
- **Logout Cleanup**: Comprehensive token cleanup on logout from both OIDC client and auth storage

## Best Practices

1. **Environment Configuration**: Use environment-specific Auth0 domains and client IDs
2. **Organization Setup**: Configure Auth0 Organizations properly for multi-tenant applications
3. **Token Management**: Implement proper token refresh and expiration handling
4. **Error Handling**: Provide user-friendly error messages for authentication failures
5. **Security Headers**: Implement proper CORS and security headers
6. **Monitoring**: Implement logging and monitoring for authentication events
7. **Testing**: Thoroughly test authentication flows in different scenarios
8. **Configuration Validation**: Verify that automatic field transformation works as expected
9. **extraQueryParams Handling**: Be aware that manual `extraQueryParams` will be replaced if non-standard fields are present

## Support

For issues specific to the Auth0 adapter, please check:

- Auth0 documentation: https://auth0.com/docs
- Auth0 community forum: https://community.auth0.com/
- IDPass DataCollect GitHub issues for adapter-specific problems