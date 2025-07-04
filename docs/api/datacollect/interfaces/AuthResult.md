[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / AuthResult

# Interface: AuthResult

Defined in: [interfaces/types.ts:735](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L735)

Authentication result returned after successful OIDC authentication.

Contains the tokens and metadata received from the OIDC provider
after a successful authentication flow.

## Example

```typescript
const authResult: AuthResult = {
  access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  id_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  refresh_token: "def50200a1b2c3d4e5f6...",
  expires_in: 3600,
  profile: {
    sub: "user-123",
    name: "John Doe",
    email: "john.doe@example.com"
  }
};
```

## Properties

### access\_token

> **access\_token**: `string`

Defined in: [interfaces/types.ts:737](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L737)

JWT access token for API authentication

***

### id\_token?

> `optional` **id\_token**: `string`

Defined in: [interfaces/types.ts:739](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L739)

Optional JWT ID token containing user identity claims

***

### refresh\_token?

> `optional` **refresh\_token**: `string`

Defined in: [interfaces/types.ts:741](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L741)

Optional refresh token for obtaining new access tokens

***

### expires\_in

> **expires\_in**: `number`

Defined in: [interfaces/types.ts:743](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L743)

Token lifetime in seconds from issuance

***

### profile?

> `optional` **profile**: `Record`\<`string`, `string`\>

Defined in: [interfaces/types.ts:745](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L745)

Optional user profile information extracted from tokens

***

### user\_metadata?

> `optional` **user\_metadata**: `Record`\<`string`, `string`\>

Defined in: [interfaces/types.ts:746](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L746)
