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

- **Mobile runtime** components live in `packages/mobile/src/formio/components/`.
- **Builder-side** registration of custom components (e.g. biometrics) was
  previously done by `public/biometric-component.js` via the iframe page.
  That path is dead in the Vue builder — custom builder components should be
  registered through `Formio.use(...)` before `Formio.builder(...)` runs in
  `FormioBuilder.vue` (pending, see OP #1059).
