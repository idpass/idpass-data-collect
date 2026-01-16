# Form.io Custom Components

The Admin Form Builder runs in an iframe serving `public/formio-builder.html`.
Because of this, custom components for the **builder** are defined in `public/biometric-component.js` and loaded via script tag in `public/formio-builder.html`.

If you need to add more components to the builder, add them to `public/biometric-component.js` or create a new file in `public/` and reference it in `public/formio-builder.html`.

The **Mobile** runtime components are defined in `packages/mobile/src/formio/components/` as they are part of the Vue application bundle.
