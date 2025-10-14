# Repository Guidelines

## Project Structure & Module Organization
ID PASS DataCollect is managed as a pnpm workspace. Core domain logic lives in `packages/datacollect/src` (TypeScript library consumed by every client). The Express API and OpenAPI schema live in `packages/backend`, with build output under `dist/`. The Vue-based admin console sits in `packages/admin/src`, and the Capacitor mobile client in `packages/mobile/src`. Shared automation scripts are in `scripts/`, container tooling in `docker/`, and documentation site content in `website/`. Tests generally live beside code inside `__tests__` folders.

## Build, Test, and Development Commands
Install dependencies once with `pnpm recursive install`. Use `pnpm build` and `pnpm test` for workspace-wide checks. Scope commands when iterating: `pnpm test:backend` runs the Jest API suite, `pnpm build:admin` triggers the Vite build, and `pnpm dev:mobile` starts the Capacitor dev server on port 8081. Backend development expects PostgreSQL 15+ and environment variables based on `.env.example`. Use `pnpm --filter @idpass/data-collect-backend serve-docs` to view the Swagger UI and `pnpm check-licenses` before release branches.

## Coding Style & Naming Conventions
Target Node 22+ and TypeScript strict mode. Adhere to the root ESLint configuration (`eslint.config.mjs`) and Prettier formatting within the UI/mobile packages. Follow the established import ordering (external packages, workspace aliases such as `@/`, then relatives). Prefer PascalCase for classes, camelCase for functions and variables, and kebab-case for Vue component filenames. Keep modules small and lean on shared helpers from `packages/datacollect` rather than duplicating logic.

## Testing Guidelines
`@idpass/data-collect-core` and backend modules rely on Jest with `*.test.ts` files inside `__tests__` directories. Admin and mobile clients use Vitest; run focused coverage with `pnpm --filter @idpass/data-collect-mobile test:coverage`. Write Arrange–Act–Assert style tests, mock external services sparingly, and avoid disabled specs. Aim to preserve existing coverage thresholds before pushing.

## Commit & Pull Request Guidelines
Use the conventional commit style seen in history (`feat:`, `fix(mobile):`, etc.) and keep scopes meaningful. PRs should describe what changed, why, any migrations, and link related GitHub issues. Attach screenshots for UI-visible alterations and note regression risks. Before requesting review, ensure `pnpm lint`, `pnpm type-check`, and relevant test commands succeed, and update configuration notes if `.env` requirements shift. Do not use emojis in commit messages and do not be verbose.
