# Accessibility

## Current Status

ID PASS DataCollect aims to be usable by the widest possible audience. The project is working toward WCAG 2.1 Level AA compliance.

### Admin Interface (Vue.js)

The admin interface is a Vue.js single-page application. Current accessibility features:

- Semantic HTML elements for navigation, forms, and content structure
- Keyboard-navigable interface
- Form labels and input associations
- Responsive design for different screen sizes and zoom levels

### Mobile Application (Capacitor)

The mobile app is built with Vue.js and Capacitor:

- Touch-accessible interface designed for field use
- Biometric authentication as an alternative to password entry
- Support for system-level accessibility features (screen readers, font scaling) via the native platform

### Backend API

The REST API is accessible to any HTTP client and does not impose visual or auditory requirements.

## Known Gaps

- Comprehensive screen reader testing has not yet been completed across all interfaces
- Color contrast has not been formally audited against WCAG 2.1 AA thresholds
- ARIA attributes may be incomplete in some admin interface components

## How to Report Issues

If you encounter an accessibility barrier:

1. Open an issue at https://github.com/idpass/idpass-data-collect/issues
2. Use the label `accessibility`
3. Describe what you were trying to do, the barrier you encountered, and any assistive technology in use

## Contributing

We welcome contributions that improve accessibility. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.
