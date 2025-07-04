[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / OIDCConfig

# Interface: OIDCConfig

Defined in: [interfaces/types.ts:695](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L695)

OpenID Connect (OIDC) configuration for authentication.

Defines the configuration parameters needed to integrate with an OIDC provider
for user authentication and authorization flows.

## Example

```typescript
const oidcConfig: OIDCConfig = {
  authority: "https://auth.example.com",
  client_id: "datacollect-app",
  redirect_uri: "https://app.example.com/callback",
  post_logout_redirect_uri: "https://app.example.com/logout",
  response_type: "code",
  scope: "openid profile email",
  state: "random-state-value",
  custom: { tenant: "production" }
};
```

## Properties

### authority

> **authority**: `string`

Defined in: [interfaces/types.ts:697](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L697)

The OIDC provider's base URL (issuer identifier)

***

### client\_id

> **client\_id**: `string`

Defined in: [interfaces/types.ts:699](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L699)

Client identifier registered with the OIDC provider

***

### redirect\_uri

> **redirect\_uri**: `string`

Defined in: [interfaces/types.ts:701](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L701)

URI where the OIDC provider redirects after successful authentication

***

### post\_logout\_redirect\_uri

> **post\_logout\_redirect\_uri**: `string`

Defined in: [interfaces/types.ts:703](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L703)

URI where the OIDC provider redirects after logout

***

### response\_type

> **response\_type**: `string`

Defined in: [interfaces/types.ts:705](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L705)

OAuth 2.0 response type (typically "code" for authorization code flow)

***

### scope

> **scope**: `string`

Defined in: [interfaces/types.ts:707](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L707)

Space-separated list of requested scopes (e.g., "openid profile email")

***

### state?

> `optional` **state**: `string`

Defined in: [interfaces/types.ts:709](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L709)

Optional state parameter for CSRF protection during auth flow

***

### extraQueryParams?

> `optional` **extraQueryParams**: `Record`\<`string`, `string`\>

Defined in: [interfaces/types.ts:711](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L711)

Optional custom parameters specific to the OIDC provider
