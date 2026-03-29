# ID PASS DataCollect Mobile App

Mobile application for data collection in the field, built with Vue.js and Capacitor.

## Prerequisites

1. Node.js 22.x or higher
2. Android SDK (for Android builds)
3. Xcode (for iOS builds, macOS only)
4. pnpm 10.x

## Local Setup

This package is part of the ID PASS DataCollect monorepo. Install dependencies from the workspace root:

```bash
# From workspace root
pnpm install
```

The mobile app uses `@idpass/data-collect-core` from the workspace, so no separate installation is needed.

### Environment Configuration

Create `.env.local` in the mobile package directory:

```sh
VITE_BACKEND_API_URL=http://localhost:3000
VITE_DB_ENCRYPTION_PASSWORD=your-encryption-password
VITE_FEATURE_DATACOLLECT=true
VITE_DEBUG=true
VITE_SYNC_URL=http://localhost:3000
```

### Development

Launch a development version of the app (web-based):

```bash
# From workspace root
pnpm dev:mobile

# Or from this directory
pnpm dev
```

The app will be available at `http://localhost:8081`.

## Android Build

### Debug APK

```bash
pnpm build:android:apk
```

### Release APK

1. Go to the `android` directory and create `keys` folder
2. Add your keystore file (e.g., `selfreg-keystore.jks`)
3. Create `keys.properties` file with the following variables:

```properties
KEY_PATH=../keys/selfreg-keystore.jks
KEY_PASSWORD=your-key-password
KEY_ALIAS=your-key-alias
KEY_STORE_PASSWORD=your-keystore-password
```

4. Build the release APK:

```bash
pnpm build:android:apk:release
```

## iOS Build

```bash
pnpm build:ios
```

This will build the app and open Xcode for further configuration and deployment.

## Accessing Configuration Forms

1. Log in to the admin dashboard at your backend URL
2. Navigate to Apps and select your application configuration
3. Download the configuration JSON or scan the QR code
4. In the mobile app, go to **Entities** and click **Create group**
5. Either:
   - Input the form URL directly (web)
   - Scan the QR code with the form URL (mobile)

## Features

- Offline-first data collection
- Form.io form rendering
- QR code scanning for configuration
- Camera integration for photo capture
- Geolocation support
- Barcode scanning
- Secure authentication with JWT-based login
- Biometric lock screen with device fingerprint/face unlock
- Secure encrypted local storage for sensitive data
- XState-driven authentication and app-lock state machines
- Bidirectional sync with backend server
- Biometric Capture App (BCA) integration for enrollment

## Biometric Capture Integration

The app supports integration with the IDPASS Biometric Capture App (BCA).
To enable this feature:
1. Ensure the BCA app is installed on the device (`io.idpass.bca`).
2. Use the "Biometric Capture" component in your Entity Forms.
3. Configure the component with the appropriate Intent Action.

The app uses a custom Capacitor plugin to launch the BCA intent and retrieve the result.


## Testing

Run unit tests:

```bash
pnpm test
```

Run tests with UI:

```bash
pnpm test:ui
```

Run tests with coverage:

```bash
pnpm test:coverage
```

## Technology Stack

- Vue 3 with Composition API
- Capacitor for native mobile features
- Vuetify 3 (Material Design 3) for UI components
- Form.io for dynamic forms
- Pinia for state management
- Vue Router for navigation
- XState for authentication and app-lock state machines
- IndexedDB (via @idpass/data-collect-core) for local offline storage

## Related Documentation

- [Mobile Package Documentation](../../website/docs/packages/mobile/index.md)
- [Getting Started Guide](../../website/docs/getting-started/index.md)
- [Authentication Workflows](../../website/docs/getting-started/authentication-workflows.md)
