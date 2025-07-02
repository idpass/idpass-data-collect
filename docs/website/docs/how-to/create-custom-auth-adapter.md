# How to Create a Custom Auth Adapter

This guide explains how to create custom authentication adapters for IDPass DataCollect to integrate with different authentication providers.

## Overview

Auth adapters implement the `AuthAdapter` interface to provide authentication functionality for specific providers. The system supports multiple authentication methods including OAuth/OIDC, basic authentication, and custom token-based systems.

## AuthAdapter Interface

All auth adapters must implement the `AuthAdapter` interface:

```typescript
export interface AuthAdapter {
  initialize(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  login(credentials: PasswordCredentials | TokenCredentials | null): Promise<{ username: string; token: string }>;
  logout(): Promise<void>;
  validateToken(token: string): Promise<boolean>;
  handleCallback(): Promise<void>;
}
```

## Implementation Pattern

For simple authentication systems, follow the `MockAuthAdapter` pattern:

```typescript
import { AuthAdapter, AuthConfig, SingleAuthStorage } from "../interfaces/types";

export class CustomBasicAuthAdapter implements AuthAdapter {
  private authenticated = false;

  constructor(
    private authStorage: SingleAuthStorage | null,
    public config: AuthConfig,
  ) {}

  async initialize(): Promise<void> {
    if (this.authStorage) {
      const token = await this.authStorage.getToken();
      if (token) {
        this.authenticated = await this.validateToken(token);
      }
    }
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authenticated;
  }

  async login(credentials: PasswordCredentials | TokenCredentials | null): Promise<{ username: string; token: string }> {
    if (!credentials || !("username" in credentials)) {
      throw new Error("Username and password required");
    }

    // Implement your authentication logic here
    const response = await this.authenticateWithProvider(credentials);
    
    if (this.authStorage) {
      await this.authStorage.setToken(response.token);
    }
    
    this.authenticated = true;
    return response;
  }

  async logout(): Promise<void> {
    if (this.authStorage) {
      await this.authStorage.removeToken();
    }
    this.authenticated = false;
  }

  async validateToken(token: string): Promise<boolean> {
    // Implement token validation logic
    return this.verifyTokenWithProvider(token);
  }

  async handleCallback(): Promise<void> {
    // Not needed for basic auth
  }

  private async authenticateWithProvider(credentials: PasswordCredentials): Promise<{ username: string; token: string }> {
    // Your custom authentication logic
    const response = await fetch(`${this.config.fields.url}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    
    if (!response.ok) {
      throw new Error('Authentication failed');
    }
    
    return await response.json();
  }

  private async verifyTokenWithProvider(token: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.fields.url}/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

## Step-by-Step Implementation

### Step 1: Create Adapter Class

Create your adapter class in `packages/datacollect/src/components/authentication/`:

```bash
touch packages/datacollect/src/components/authentication/MyCustomAuthAdapter.ts
```

### Step 2: Implement Interface

```typescript
import { AuthAdapter, AuthConfig, SingleAuthStorage } from "../../interfaces/types";

export class MyCustomAuthAdapter implements AuthAdapter {
  constructor(
    private authStorage: SingleAuthStorage | null,
    public config: AuthConfig,
  ) {}

  // Implement all required methods
  async initialize(): Promise<void> { /* ... */ }
  async isAuthenticated(): Promise<boolean> { /* ... */ }
  async login(credentials: any): Promise<{ username: string; token: string }> { /* ... */ }
  async logout(): Promise<void> { /* ... */ }
  async validateToken(token: string): Promise<boolean> { /* ... */ }
  async handleCallback(): Promise<void> { /* ... */ }
}
```

### Step 3: Register Adapter

Add your adapter to the `adaptersMapping` in `AuthManager.ts`:

```typescript
import { MyCustomAuthAdapter } from "./authentication/MyCustomAuthAdapter";

const adaptersMapping = {
  auth0: Auth0AuthAdapter,
  keycloak: KeycloakAuthAdapter,
  mycustom: MyCustomAuthAdapter, // Add your adapter
};
```

### Step 4: Configure Authentication

Use your adapter in the configuration:

```json
{
  "type": "mycustom",
  "fields": {
    "url": "https://auth.example.com",
    "client_id": "your-client-id",
    "api_key": "your-api-key"
  }
}
```

## Configuration Patterns

### OAuth Configuration
```json
{
  "type": "custom-oauth",
  "fields": {
    "authority": "https://auth.example.com",
    "client_id": "your-client-id",
    "redirect_uri": "http://localhost:3000/callback",
    "scope": "openid profile email"
  }
}
```

## Best Practices

### Error Handling
```typescript
async validateToken(token: string): Promise<boolean> {
  try {
    const response = await this.callAuthProvider(token);
    return response.ok;
  } catch (error) {
    console.error("Token validation failed:", error);
    return false;
  }
}
```

### Environment Detection
```typescript
constructor(authStorage: SingleAuthStorage | null, config: AuthConfig) {
  this.appType = typeof window !== 'undefined' ? 'frontend' : 'backend';
  // Use different validation strategies based on environment
}
```

### Token Storage
```typescript
async login(credentials: any): Promise<{ username: string; token: string }> {
  const result = await this.authenticate(credentials);
  
  // Always store tokens when available
  if (this.authStorage && result.token) {
    await this.authStorage.setToken(result.token);
  }
  
  return result;
}
```

### Config Validation
```typescript
constructor(authStorage: SingleAuthStorage | null, config: AuthConfig) {
  if (!config.fields.url) {
    throw new Error("URL is required for custom auth adapter");
  }
  this.config = config;
}
```

## Testing Your Adapter

Create tests following the pattern in `AuthManager.test.ts`:

```typescript
import { MyCustomAuthAdapter } from "../authentication/MyCustomAuthAdapter";

describe("MyCustomAuthAdapter", () => {
  let adapter: MyCustomAuthAdapter;
  let mockAuthStorage: jest.Mocked<SingleAuthStorage>;

  beforeEach(() => {
    mockAuthStorage = {
      getToken: jest.fn(),
      setToken: jest.fn(),
      removeToken: jest.fn(),
    };

    adapter = new MyCustomAuthAdapter(mockAuthStorage, {
      type: "mycustom",
      fields: { url: "https://test.example.com" }
    });
  });

  it("should authenticate successfully", async () => {
    // Test implementation
  });
});
```

## Common Use Cases

### 1. API Key Authentication
```typescript
async login(credentials: TokenCredentials): Promise<{ username: string; token: string }> {
  const apiKey = credentials.token;
  const isValid = await this.validateApiKey(apiKey);
  
  if (!isValid) {
    throw new Error("Invalid API key");
  }

  return { username: "api-user", token: apiKey };
}
```

### 2. JWT Token Validation
```typescript
async validateToken(token: string): Promise<boolean> {
  try {
    const payload = this.decodeJWT(token);
    return payload.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}
```

### 3. Custom Headers
```typescript
private async makeAuthenticatedRequest(token: string) {
  return fetch(this.config.fields.url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Custom-Header': this.config.fields.customHeader,
    }
  });
}
```

## Troubleshooting

### Common Issues

1. **Adapter not found**: Ensure it's registered in `adaptersMapping`
2. **Token validation fails**: Check endpoint URLs and request format
3. **Storage errors**: Verify `SingleAuthStorage` is properly injected
4. **CORS issues**: Configure your auth provider for cross-origin requests

### Debug Logging
```typescript
async validateToken(token: string): Promise<boolean> {
  console.log(`Validating token for ${this.config.type}`);
  const isValid = await this.performValidation(token);
  console.log(`Token validation result: ${isValid}`);
  return isValid;
}
```

## Alternative Solutions

- **Extend existing adapters** for similar OAuth providers
- **Use MockAuthAdapter** for development/testing
- **Implement multiple adapters** for different environments
- **Create adapter factories** for dynamic provider selection 