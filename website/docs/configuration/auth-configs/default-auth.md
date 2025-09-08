---
id: default-auth
title: Built-in Authentication
sidebar_position: 2
---

# Default Authentication

The IDPass Data Collect system includes a built-in authentication mechanism that provides a simple username/password login system without requiring external authentication providers like Auth0 or Keycloak.

## Overview

The default authentication system consists of:

- **Backend**: User management with JWT token generation
- **Frontend**: Login form and token management
- **Mobile**: Authentication integration with the mobile app
- **Data Layer**: User storage and password hashing

## Architecture

### Backend Components

#### User Store (`UserStore.ts`)
The `UserStoreImpl` class manages user data in a PostgreSQL database:

```typescript
interface UserWithPasswordHash {
  id: number;
  email: string;
  passwordHash: string;
  role: Role;
}
```

**Key Features:**
- User CRUD operations (Create, Read, Update, Delete)
- Password hashing using bcrypt
- Role-based access control (ADMIN, USER)
- Database initialization with user table

#### User Routes (`userRoutes.ts`)
RESTful API endpoints for user authentication:

- `POST /api/users/login` - User login with email/password
- `GET /api/users/check-token` - Validate JWT token
- `GET /api/users/me` - Get current user information
- `POST /api/users` - Create new user (admin only)
- `PUT /api/users/:id` - Update user (admin only)
- `DELETE /api/users/:email` - Delete user (admin only)

#### Authentication Middleware (`authentication.ts`)
JWT-based authentication middleware:

- `authenticateJWT` - Validates JWT tokens for protected routes
- `createAuthAdminMiddleware` - Ensures admin role access
- `createDynamicAuthMiddleware` - Handles dynamic app authentication

### Frontend Components

#### Auth Manager (`AuthManager.ts`)
The core authentication manager in the datacollect package:

```typescript
class AuthManager {
  constructor(
    private configs: AuthConfig[],
    private syncServerUrl: string,
    private authStorage?: AuthStorageAdapter,
  ) {}
}
```

**Key Methods:**
- `defaultLogin(credentials: PasswordCredentials)` - Handles username/password login
- `isAuthenticated()` - Checks authentication status across all providers
- `login()` - Initiates login process
- `logout()` - Clears all authentication tokens

**Default Login Flow:**
1. Validates credentials against sync server
2. Receives JWT token from backend
3. Stores token in auth storage with "default" provider key
4. Returns authentication status

#### Mobile Auth Manager Store (`authManager.ts`)
Pinia store for mobile authentication state management:

```typescript
export const useAuthManagerStore = defineStore('authManager', () => {
  // State management for authentication
  const isAuthenticated = ref(false)
  const currentProvider = ref<string | null>(null)
  const authManager = ref<EntityDataManager | null>(null)
})
```

**Key Features:**
- Initializes authentication system with app-specific configuration
- Manages login/logout flows
- Handles OAuth callbacks
- Provides authentication state across the mobile app

#### Auth Screen (`AuthScreen.vue`)
Vue component for the authentication interface:

```vue
<template>
  <form @submit.prevent="onLogin">
    <input type="email" v-model="form.email" />
    <input type="password" v-model="form.password" />
    <button type="submit">Login</button>
  </form>
</template>
```

**Features:**
- Email/password login form
- Error handling and display
- Loading states
- OAuth provider integration
- Callback processing for OAuth flows

## Authentication Flow

### 1. User Login Process

```mermaid
sequenceDiagram
    participant U as User
    participant AS as AuthScreen
    participant AM as AuthManager
    participant SS as SyncServer
    participant AS as AuthStorage

    U->>AS: Enter credentials
    AS->>AM: login(credentials)
    AM->>SS: POST /api/users/login
    SS->>SS: Validate credentials
    SS->>AM: Return JWT token
    AM->>AS: Store token (provider: "default")
    AM->>AS: Return success
    AS->>U: Redirect to app
```

### 2. Token Validation

```mermaid
sequenceDiagram
    participant C as Client
    participant M as Middleware
    participant US as UserStore
    participant DB as Database

    C->>M: Request with Bearer token
    M->>M: Verify JWT signature
    M->>US: Get user by email
    US->>DB: Query user data
    DB->>US: Return user
    US->>M: Return user with role
    M->>C: Allow/deny access
```

## Configuration

### Environment Variables

```bash
# JWT Secret for token signing
JWT_SECRET=your-secret-key

# Database connection
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
```

### User Roles

The system supports two user roles:

- **ADMIN**: Full access to user management and system configuration
- **USER**: Standard user access to data collection features

### Password Security

- Passwords are hashed using bcrypt with 10 salt rounds
- Plain text passwords are never stored
- Password validation occurs on every login attempt

## Usage Examples

### Backend User Creation

```typescript
import { UserStoreImpl } from './stores/UserStore';
import bcrypt from 'bcrypt';

const userStore = new UserStoreImpl(connectionString);
await userStore.initialize();

// Create admin user
const passwordHash = await bcrypt.hash('admin123', 10);
await userStore.saveUser({
  email: 'admin@example.com',
  passwordHash,
  role: Role.ADMIN
});
```

### Frontend Authentication

```typescript
import { AuthManager } from 'idpass-data-collect';

const authManager = new AuthManager(configs, syncServerUrl, authStorage);
await authManager.initialize();

// Login with credentials
await authManager.login({
  username: 'user@example.com',
  password: 'password123'
});

// Check authentication status
const isAuth = await authManager.isAuthenticated();
```

### Mobile App Integration

```typescript
import { useAuthManagerStore } from '@/store/authManager';

const authStore = useAuthManagerStore();

// Initialize for specific app
await authStore.initialize('app-id');

// Login with default authentication
await authStore.login(null, {
  username: 'user@example.com',
  password: 'password123'
});

// Handle successful login
await authStore.handleDefaultLogin();
```

## Integration with External Providers

The default authentication system can coexist with external providers:

1. **Multiple Auth Configs**: Configure both default and external providers
2. **Fallback Mechanism**: Use default auth when external providers fail
3. **Unified Interface**: Same API regardless of authentication method
4. **Token Management**: Centralized token storage and validation

## Troubleshooting

### Common Issues

1. **JWT Secret Not Set**
   - Ensure `JWT_SECRET` environment variable is configured
   - Restart the backend server after setting the variable

2. **Database Connection Issues**
   - Verify `DATABASE_URL` is correct
   - Ensure PostgreSQL is running and accessible
   - Check database permissions

3. **Token Validation Failures**
   - Verify token format and signature
   - Check token expiration
   - Ensure consistent JWT secret across services

4. **Mobile Authentication Issues**
   - Clear app storage and reinitialize
   - Verify network connectivity
   - Check app configuration and tenant settings
