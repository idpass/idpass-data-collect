# Form.io Builder (Vue)

The Admin Form Builder is the in-app Vue component `src/components/FormioBuilder.vue`
(migrated from the legacy `public/formio-builder.html` iframe in OP #1059).

## Styling

`loadBuilderAssets.ts` is the single styling entry point, imported by the
builder component. It bundles (no CDN):

- `@formio/js/dist/formio.full.min.css` — Form.io's own builder/dialog styles
  (prefixed selectors, loaded globally).
- `font-awesome` (npm) — glyphs for component icons (`.fa-*` only).
- `builder-theme.scss` — Bootstrap 4 compiled from SCSS with its variables
  mapped to the ID PASS design tokens, **scoped** under
  `.formio-builder-host` and `.formio-dialog` so it cannot leak into the
  Vuetify dashboard, plus the ID PASS builder chrome (sidebar chips, drop
  zone, tabs, drag ghost).

Token values are duplicated as SCSS hex (SCSS cannot read CSS custom
properties at compile time). Source of truth: `src/assets/design-tokens.css`
— keep `builder-theme.scss` in sync when the brand changes.

## Custom components

- **Builder-side** components (`biometricCapture`, `claim169Scanner`) are
  defined in `builderComponents.ts` and registered via
  `registerBuilderComponents()`, which `FormioBuilder.vue` calls before
  `Formio.builder(...)`. They are builder-only definitions (schema +
  `builderInfo` palette entry + `editForm` settings); the admin never captures,
  so the default Field render is used. This replaces the legacy global
  `public/biometric-component.js` loaded by the removed builder iframe (#1059).
- **Mobile runtime** components live in `packages/mobile/src/formio/components/`
  (`BiometricCapture.ts`, `Claim169Scanner.ts`) — they implement the actual
  capture/scan behaviour. Note mobile uses `formiojs` (v4) while admin uses
  `@formio/js` (v5), so the two are kept as separate definitions by design.
