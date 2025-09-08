---
title: "@idpass/data-collect-mobile"
sidebar_position: 4
---

# Mobile Package

The Mobile package is an offline-first client application for ID PASS DataCollect that serves as a mobile data collection interface. It operates as a client instance that synchronizes with the DataCollect sync server when connectivity is available, enabling reliable data collection in environments with intermittent or no internet connectivity.

The Mobile package provides a Vue.js-based mobile application for ID PASS DataCollect, built with Capacitor for cross-platform mobile development. It supports both traditional form-based data collection and dynamic app configurations.

Built with Vue 3, TypeScript, and Capacitor, the mobile application offers a flexible data collection solution for:
- Dynamic app configuration loading via QR codes or URLs
- Traditional form-based data collection
- Offline-first data storage with RxDB
- Cross-platform mobile deployment (iOS/Android)

### Key Features

- 📱 **Cross-Platform**: Native mobile apps for iOS and Android using Capacitor
- 🔄 **Dynamic App Loading**: Load app configurations via QR code scanning or URL input
- 📊 **Form Builder Integration**: Full FormIO integration for dynamic form creation
- 💾 **Offline Storage**: Local database with RxDB for offline data collection
- 🔐 **Secure Authentication**: JWT-based authentication with OAuth provider support (Auth0, Keycloak)
- 🔑 **Multi-Provider Auth**: Support for multiple authentication providers per app configuration
- 🎨 **QR Code Scanning**: Built-in barcode scanning for app configuration loading
- 🎨 **Responsive Design**: Bootstrap-based UI with mobile-optimized components

## Architecture

```mermaid
graph TB
    A[Mobile App] -->|Feature Flag| B[DyApp.vue]
    A -->|Feature Flag| C[App.vue]
    
    B --> D[Dynamic Views]
    C --> E[Traditional Views]
    
    D --> F[DyHome.vue]
    D --> G[DynamicAppView.vue]
    D --> H[DynamicDetailView.vue]
    
    E --> I[Form Views]
    E --> J[Auth Views]
    
    F --> K[QR Scanner]
    F --> L[App Management]
    
    G --> M[Form Rendering]
    G --> N[Data Collection]
    
    H --> O[Entity Details]
    H --> P[Data Editing]
```

## Core Features

### Dynamic App Configuration
The mobile app supports loading app configurations dynamically:
- **QR Code Scanning**: Scan QR codes to load app configurations
- **URL Input**: Manually enter app configuration URLs
- **Local Storage**: Store multiple app configurations locally
- **App Switching**: Switch between different app configurations

### Form-Based Data Collection
Traditional form-based data collection:
- **FormIO Integration**: Full FormIO form builder support
- **Dynamic Forms**: Render forms based on configuration
- **Data Validation**: Client-side and server-side validation
- **File Upload**: Support for image and document uploads

### Offline Capabilities
Offline-first data collection:
- **Local Database**: RxDB for local data storage
- **Sync Management**: Background synchronization when online
- **Conflict Resolution**: Handle data conflicts during sync

## Authentication

### Authentication Setup
The mobile app supports multiple authentication methods:

#### Username/Password Authentication
```typescript
import { AuthManager, IndexedDbAuthStorageAdapter } from '@idpass/data-collect-core';

// Initialize authentication
const authStorageAdapter = new IndexedDbAuthStorageAdapter('mobile-auth');
await authStorageAdapter.initialize();

const authManager = new AuthManager(
  [], // Auth configs loaded from app configuration
  syncServerUrl,
  authStorageAdapter
);

// Login with credentials
await authManager.login({
  username: 'user@example.com',
  password: 'password123'
}, null);
```

#### OAuth Provider Authentication
```typescript
// Auth0 login
const auth0Config = {
  type: 'auth0',
  fields: {
    domain: config.domain,
    client_id: config.client_id,
    scope: 'openid profile email'
  }
};

const authManager = new AuthManager(
  [auth0Config],
  process.env.VITE_BACKEND_URL,
  authStorageAdapter
);

// Login with OAuth token
await authManager.loginWithToken(null, 'auth0');
```

### Authentication Components

#### LoginView.vue
```vue
<template>
  <div class="login-container">
    <form @submit.prevent="handleLogin">
      <div class="form-group">
        <label for="email">Email</label>
        <input 
          id="email"
          v-model="credentials.email"
          type="email"
          class="form-control"
          required
        />
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input 
          id="password"
          v-model="credentials.password"
          type="password"
          class="form-control"
          required
        />
      </div>
      <button type="submit" class="btn btn-primary">Login</button>
    </form>
    
    <!-- OAuth provider buttons -->
    <div class="oauth-providers mt-3">
      <button @click="loginWithAuth0" class="btn btn-outline-primary">
        Login with Auth0
      </button>
      <button @click="loginWithKeycloak" class="btn btn-outline-secondary">
        Login with Keycloak
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const credentials = ref({
  email: '',
  password: ''
});

const handleLogin = async () => {
  await authStore.login(credentials.value);
};

const loginWithAuth0 = async () => {
  await authStore.loginWithProvider('auth0');
};

const loginWithKeycloak = async () => {
  await authStore.loginWithProvider('keycloak');
};
</script>
```

#### AuthGuard
```typescript
// Route guard for authentication
export const authGuard = async (to: any, from: any, next: any) => {
  const authStore = useAuthStore();
  
  if (await authStore.isAuthenticated()) {
    next();
  } else {
    next('/login');
  }
};
```

## Quick Start

### Installation

```bash
cd ./packages/mobile
npm install
```

### Development Setup

Create a `.env` file:

```env
# Database Configuration
VITE_DB_ENCRYPTION_PASSWORD=password
VITE_FEATURE_DYNAMIC=true
VITE_DEVELOP=true
```

### Development

```bash
npm run dev
```

The mobile app will be available at `http://localhost:8081`

### Mobile Development

```bash
# Build for iOS
npm run build:ios

# Build for Android
npm run build:android
```

## Application Structure

### Root Components

#### DyApp.vue
The dynamic app root component used when `VITE_FEATURE_DYNAMIC` is enabled:

```vue
<template>
  <header>
    <nav class="safe-top navbar p-3 d-flex justify-content-center border-bottom align-items-center">
      <h5 class="m-0 bold title text-black">ID PASS DataCollect</h5>
    </nav>
  </header>
  <main class="mx-2">
    <div class="user-select-none disable-scrollbars">
      <RouterView />
    </div>
  </main>
</template>
```

#### App.vue
The traditional app root component used when dynamic features are disabled:

```vue
<template>
  <div id="app" class="vh-100 h-100 overflow-scroll text-break">
    <header>
      <nav class="safe-top navbar p-3 d-flex justify-content-center border-bottom align-items-center">
        <h5 class="m-0 bold title text-black">ID PASS DataCollect</h5>
      </nav>
    </header>
    <main class="mx-2">
      <div class="user-select-none disable-scrollbars">
        <RouterView />
      </div>
    </main>
    <footer class="pb-safe"></footer>
  </div>
</template>
```

### Dynamic Views

#### DyHome.vue
The main dashboard for dynamic app management:

```vue
<template>
  <div class="d-flex flex-column gap-2">
    <h2 class="mb-4">Apps</h2>
    <!-- App list and management -->
    <ul role="list" class="list-group list-group-flush shadow-sm mt-2">
      <li v-for="app in tenantapps" :key="app.name" class="card border-0 rounded-0">
        <!-- App item -->
      </li>
    </ul>
    <!-- QR scanner button -->
  </div>
</template>
```

#### DynamicAppView.vue
Renders dynamic forms based on app configuration:

```vue
<template>
  <div class="dynamic-app">
    <!-- Form rendering based on configuration -->
    <Formio 
      :form="formConfig"
      :submission="submission"
      @submit="handleSubmit"
    />
  </div>
</template>
```

### Environment Variables

```env
# Feature Flags
VITE_DB_ENCRYPTION_PASSWORD=password
VITE_FEATURE_DYNAMIC=true
VITE_DEVELOP=true
```

### Capacitor Configuration

```typescript
const config: CapacitorConfig = {
  appId: "com.openspp.selfreg",
  appName: "ID PASS DataCollect",
  webDir: "dist",
  server: {
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};
```

## Database Schema

### Tenant App Schema
```typescript
interface TenantAppData {
  id: string;
  name: string;
  description?: string;
  configuration: any;
  authConfigs?: AuthConfig[];
  createdAt: Date;
  updatedAt: Date;
}
```

### Auth Config Schema
```typescript
interface AuthConfig {
  type: 'auth0' | 'keycloak';
  fields: {
    domain?: string;        // Auth0 domain
    clientId: string;       // Client ID
    audience?: string;      // API audience
    scope?: string;         // OAuth scope
    url?: string;          // Keycloak URL
    realm?: string;        // Keycloak realm
  };
}
```

### User Session Schema
```typescript
interface UserSession {
  id: string;
  userId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  provider?: string;
  createdAt: Date;
}
```

### Form Schema
```typescript
interface FormData {
  id: string;
  appId: string;
  userId: string;
  formConfig: any;
  submissions: any[];
  createdAt: Date;
}
```

## Components

### Core Components

#### AuthStore
Pinia store for authentication state management:
```typescript
import { defineStore } from 'pinia';
import { AuthManager } from '@idpass/data-collect-core';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as any,
    isAuthenticated: false,
    authManager: null as AuthManager | null
  }),
  
  actions: {
    async login(credentials: { email: string; password: string }) {
      if (!this.authManager) return;
      
      await this.authManager.login({
        username: credentials.email,
        password: credentials.password
      });
      
      this.isAuthenticated = await this.authManager.isAuthenticated();
      this.user = await this.authManager.getCurrentUser();
    },
    
    async loginWithProvider(provider: string) {
      // Handle OAuth provider login
      if (!this.authManager) return;
      
      // Implement OAuth flow for mobile
      await this.authManager.handleCallback(provider);
      this.isAuthenticated = await this.authManager.isAuthenticated();
      this.user = await this.authManager.getCurrentUser();
    },
    
    async logout() {
      if (!this.authManager) return;
      
      await this.authManager.logout();
      this.isAuthenticated = false;
      this.user = null;
    }
  }
});
```

#### QrScanner
QR code scanning for app configuration loading:
```vue
<template>
  <QrScanner 
    @scan="handleScan"
    @error="handleError"
  />
</template>
```

#### SaveDialog
Modal dialog for saving data:
```vue
<template>
  <Dialog
    :open="open"
    :title="title"
    @update:open="$emit('update:open', $event)"
    :onSave="onSave"
  >
    <template #form-content>
      <!-- Dialog content -->
    </template>
  </Dialog>
</template>
```

### Form Components
- FormIO integration components
- Dynamic form rendering
- Validation components
- File upload components


## Mobile Features

### Capacitor Plugins
- **Camera**: QR code scanning
- **Haptics**: Tactile feedback
- **Keyboard**: Mobile keyboard handling
- **Status Bar**: Status bar customization

### Platform-Specific Features
- **Android**: Native Android integration

## Testing

### Unit Tests
```bash
npm run test:unit
```

### Component Testing
```bash
npm run test:component
```

### Mobile Testing
```bash
# iOS Simulator
npm run build:ios

# Android Emulator
npm run build:android
```

## Deployment

### Mobile App Stores
- **iOS App Store**: Submit to Apple App Store
- **Google Play Store**: Submit to Google Play Store

### Web Deployment
```bash
npm run build
npm run preview
```

### Capacitor Build
```bash
# iOS
npm run build:ios

# Android
npm run build:android
```

## Browser Support

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## Mobile Platform Support
- **Android**: API level 21+

## Performance

- Lazy loading of app configurations
- Optimized form rendering
- Efficient local database operations
- Background sync capabilities
- Image optimization for mobile



## Next Steps

- 🔧 [Configuration Guide](../../../configuration/) - App configuration management