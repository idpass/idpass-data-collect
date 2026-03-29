# ID PASS DataCollect Web

> Vue 3 web app for agent data collection and citizen self-service

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)

## Overview

`@idpass/data-collect-web` is a Vue 3 progressive web application that provides browser-based data collection for field agents and self-service registration for citizens. It uses `@idpass/data-collect-core` for offline-first data management with IndexedDB.

> **Note:** This is a private package and is not published to a package registry.

## Key Features

- **Offline-First**: Full functionality without network connectivity using IndexedDB
- **Multiple Auth Methods**: OTP (one-time password), National ID, and OIDC (OpenID Connect)
- **Dynamic Forms**: Form.io-based configurable entity forms loaded from server config
- **Sync**: Automatic synchronization with the backend when connectivity is restored
- **Internationalization**: Built-in i18n support via vue-i18n

## Quick Start

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development server (port 5174)
pnpm --filter @idpass/data-collect-web dev
```

Or from within the package directory:

```bash
pnpm dev
```

The app will be available at `http://localhost:5174`.

### Build for Production

```bash
pnpm build
```

## Contributing

See the main project [Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](../../LICENSE) for details.
