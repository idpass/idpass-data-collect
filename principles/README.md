# DataCollect Development Principles

Core principles and standards for ID PASS DataCollect development.

## Principle Documents

| Document | Description |
|----------|-------------|
| [architecture.md](architecture.md) | Package layout, dependency rules, offline-first design |
| [event-sourcing.md](event-sourcing.md) | Event sourcing patterns, CQRS, event appliers |
| [sync.md](sync.md) | Internal sync (client↔server) and external sync (server↔third-party) |
| [storage-adapters.md](storage-adapters.md) | Adapter interface contracts, IndexedDB vs Postgres, platform neutrality |
| [external-adapters.md](external-adapters.md) | Writing ExternalSyncAdapterV2 implementations (e.g. OpenSPP) |
| [api-design.md](api-design.md) | Backend REST API conventions, auth, error shapes |
| [testing.md](testing.md) | Test types, coverage targets, fake-indexeddb patterns |
| [naming-conventions.md](naming-conventions.md) | TypeScript naming, file layout, package imports |
| [error-handling.md](error-handling.md) | AppError, logging, no PII in logs |
| [platform-neutrality.md](platform-neutrality.md) | Keeping datacollect library browser+Node compatible |

## How to Use

1. **New features**: Read relevant principles before writing code
2. **Code review**: Reference principles when reviewing PRs
3. **Onboarding**: Read all documents before starting
4. **Decisions**: Use principles to resolve implementation questions

---

**Last Updated:** 2026-03-09
