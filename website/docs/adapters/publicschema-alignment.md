---
id: publicschema-alignment
title: PublicSchema Alignment
sidebar_label: PublicSchema Alignment
description: How ID PASS DataCollect entity concepts map to the PublicSchema.org standard.
---

# PublicSchema Alignment

[PublicSchema.org](https://publicschema.org/) is a shared set of definitions for public service delivery systems. It defines Core concepts (Person, Household, Identifier, Location, Group, etc.), Civil Registration concepts (Birth, Death, Marriage, VitalEvent), and Social Protection concepts (Enrollment, Entitlement, Program). These definitions give programs serving overlapping populations a common language for coordination and data exchange.

ID PASS DataCollect aligns its entity model with PublicSchema concepts so adapters and third-party integrations can reason about the data in a standardised way. This page documents the mapping and design decisions.

## Form generator

The `@idpass/publicschema` workspace package vendors a narrow mirror of PublicSchema v0.2.0 (Person, Group, Identifier + six vocabularies) and exposes a JSON Schema → Form.io generator. The admin wizard surfaces this as a **Generate from PublicSchema…** button in the Entity Forms step — operators produce forms that line up with the registry schema by construction, ready to edit or save as-is. Generated forms carry `generatedFrom` provenance metadata so future upstream versions can offer a structured refresh.

See [Generate Entity Forms from PublicSchema](../how-to/generate-forms-from-publicschema.md) for the operator walkthrough.

## Why align with PublicSchema

- **Standard vocabulary** — third-party systems that speak PublicSchema can exchange data with DataCollect without custom mapping exercises
- **Coordination across programs** — different social protection programs serving the same households can reconcile their records
- **Future-proofing** — as PublicSchema evolves, DataCollect and its adapters can adopt new concepts incrementally

## Entity mapping

| DataCollect concept | PublicSchema concept | Notes |
|---|---|---|
| `IndividualDoc` (EntityType.Individual) | [Person](https://publicschema.org/Person/) | Fields in `data` map to Person properties (given_name, family_name, date_of_birth, gender) |
| `GroupDoc` (EntityType.Group) | [Group](https://publicschema.org/Group/) / Household | `group_type` distinguishes household, family, case |
| `MembershipRecord` | Group membership relationship | `role` field aligned with PublicSchema membership roles (head, spouse, child, etc.) |
| `IdentifierRecord` | [Identifier](https://publicschema.org/Identifier/) | Value + type pair identifying an entity within a scheme |
| Attachment metadata (future) | [IdentityDocument](https://publicschema.org/IdentityDocument/) | A physical or digital document that carries an Identifier and has lifecycle metadata (issue_date, expiry_date, issuing_authority) |

## Identifier vs IdentityDocument — an important distinction

PublicSchema draws a sharp line between these two concepts:

> **The number on a passport is an Identifier; the passport book is an IdentityDocument.**

| | **Identifier** | **IdentityDocument** |
|---|---|---|
| **What** | A coded value | A physical or digital document |
| **Example** | `"P12345678"` (passport number) | The passport book itself |
| **Fields** | value, type, scheme_id, scheme_name | document_type, issuing_authority, issue_date, expiry_date, identifiers[] |
| **Lifecycle** | No — just a value | Yes — issued, expires, has authority |
| **Relationship** | Standalone | Contains one or more Identifiers |

DataCollect's `IdentifierRecord` represents the **Identifier** concept. Identity documents with full lifecycle metadata are currently modeled as attachments plus an IdentifierRecord; a dedicated IdentityDocument entity is planned for a future release when adapters need to exchange issue/expiry dates and issuing authority information.

## The `system_id` convention

When an external registry needs to address a record via its REST API but the record has no real-world identifier yet (no national ID, no passport), the registry can auto-assign a **system_id** — a stable UUID that serves as the record's identifier of last resort.

In the [mock registry server](https://github.com/idpass/idpass-datacollect/tree/main/examples/mock-server) and the [OpenSPP V2 adapter](./openspp-v2-adapter):

- Every new Person and Group gets a `system_id` identifier auto-assigned on creation
- The `system_id` uses a registry-specific scheme URI (e.g., `urn:mock:vocab:id-type` or `urn:openspp:vocab:id-type`)
- The identifier type is literally `system_id`
- The UI hides `system_id` entries from identity document lists (they aren't documents — they're API addressing keys)
- The REST API returns `system_id` in the `identifiers[]` array alongside any real-world identifiers
- The DataCollect adapter uses `system_id` as its fallback when resolving records that lack real-world identifiers

The `system_id` concept is not currently in the PublicSchema identifier-type vocabulary (which has 20 externally-issued types). The closest fit is `other`. A future proposal to PublicSchema may introduce `system_id` or `registry_id` as a named type for registry-assigned technical identifiers.

## JSON serialization

DataCollect and its adapters use **flat JSON with PublicSchema field names**, not JSON-LD. This is a pragmatic trade-off:

- **Pro** — simpler for adapters and integrators; no `@context` machinery; easier to inspect in browser devtools
- **Con** — not strictly compliant with PublicSchema's JSON-LD serialization

Applications that need strict JSON-LD can layer that on top of DataCollect's output by adding a `@context` block and `@type` annotations.

Field naming follows PublicSchema convention (snake_case): `given_name`, `family_name`, `date_of_birth`, `identifier_value`, `identifier_type`, `identifier_scheme_id`, `document_type`, `issuing_authority`, `issue_date`, `expiry_date`.

## References

- [PublicSchema.org](https://publicschema.org/) — main site
- [PublicSchema Identifier concept](https://publicschema.org/Identifier/)
- [PublicSchema IdentityDocument concept](https://publicschema.org/IdentityDocument/)
- [PublicSchema identifier-type vocabulary](https://publicschema.org/vocab/identifier-type/) — 20 defined types
- [Mock registry server](https://github.com/idpass/idpass-datacollect/tree/main/examples/mock-server) — reference implementation
