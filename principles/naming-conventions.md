# Naming Conventions

## TypeScript

| Construct | Convention | Example |
|-----------|-----------|---------|
| Classes | PascalCase | `InternalSyncManager` |
| Interfaces | PascalCase | `ExternalSyncAdapterV2` |
| Enums | PascalCase values | `EntityType.Individual` |
| Functions / methods | camelCase | `pushToRemote()` |
| Variables | camelCase | `syncManager` |
| Constants | camelCase (or UPPER_SNAKE for true constants) | `DEFAULT_PAGE_SIZE` |
| Type aliases | PascalCase | `SyncCapability` |

## Files

| Content | Convention | Example |
|---------|-----------|---------|
| Classes / services | PascalCase | `EventApplierService.ts` |
| Vue components | PascalCase | `EntityList.vue` |
| Test files | same name + `.test.ts` | `EventApplierService.test.ts` |
| Utility modules | camelCase | `logger.ts` |

## Imports

Order within a file:
1. External packages
2. Workspace aliases (`@/`)
3. Relative imports (`../`, `./`)

Use workspace package names (`@idpass/data-collect-core`) for cross-package imports — never use relative paths across package boundaries.

## Event Type Strings

Event type identifiers use kebab-case: `create-group`, `add-member`, `update-individual`.

When adding custom events, prefix with your domain to avoid collisions: `openspp-push-beneficiary`.

## Adapter Type Strings

Adapter `type` in `AdapterDescriptor` uses kebab-case: `openspp-v2`, `openfn`, `mock`.

These strings appear in tenant config files — once deployed, changing them is a breaking change.
