---
id: generate-forms-from-publicschema
title: Generate Entity Forms from PublicSchema
sidebar_label: Generate forms from PublicSchema
description: Seed DataCollect entity forms from a PublicSchema concept definition.
---

# Generate Entity Forms from PublicSchema

When your target registry is PublicSchema-aligned (for example the [mock registry server](https://github.com/idpass/idpass-data-collect/tree/main/examples/mock-server) or the OpenSPP V2 registry), you can seed a program's entity forms from the PublicSchema concept definitions instead of hand-building each one in the wizard.

## When to use this

- You are creating a new program and want a form that lines up with the registry schema by construction.
- You want every field the form collects to survive the full round-trip: mobile → backend → adapter → registry and back.
- You want a consistent starting point across programs.

## What PublicSchema is

[PublicSchema](https://publicschema.org) is a shared reference model for public-service delivery systems. It defines concepts (Person, Group, Identifier, Household, Program, …) and controlled vocabularies (gender-type, country, identifier-type, …) with permanent URLs for each definition. DataCollect vendors a narrow subset as `@idpass/publicschema` and pins to a specific upstream version.

## Scope of the v0.1.0 generator

The vendored narrow mirror covers three concepts and six vocabularies:

| Concept | entityType | Notes |
|---|---|---|
| Person | `individual` | Natural person — name, DOB, gender, identifiers |
| Group | `group` | Household, family, cooperative — name, group type, identifiers |
| Identifier | `individual` | Standalone identifier; usually nested inside Person or Group |

Vocabularies wired as Form.io selects: gender-type, identifier-type, country, language, relationship-type, group-type.

## Generate a form

1. Open the admin UI and start a new program (or edit an existing one).
2. Go to the **Entity Forms** step.
3. Click **+ Generate from PublicSchema…**
4. Pick a concept. Confirm.
5. The generated form is inserted at the end of the list, pre-filled and fully editable. A `PS 0.2.0` chip marks it as generated.
6. Continue editing (add custom fields, reorder, remove ones you do not need) or save as-is.

## Provenance metadata

Each generated form carries a `generatedFrom` field in the saved program config:

```json
{
  "name": "person",
  "title": "Person",
  "entityType": "individual",
  "formio": { "display": "form", "components": [...] },
  "generatedFrom": {
    "source": "publicschema",
    "publicSchemaVersion": "0.2.0",
    "concept": "Person",
    "generatedAt": "2026-04-21T10:00:00.000Z"
  }
}
```

This lets the admin UI label the form and will power a future "Refresh against PublicSchema v0.3.0" action.

## What the generator does and does not do

- **Does**: map JSON Schema scalars (`string`, `number`, `boolean`, `date`) to Form.io components; map `x-vocabulary`-bound strings to selects sourced from the bundled SKOS vocabularies; map `array` of objects to a Form.io `datagrid`; copy `description` to `tooltip`.
- **Does not**: validate PublicSchema conformance on submission, refresh against a newer upstream version, generate forms for concepts outside the narrow mirror, or enforce the mapping after the operator edits the form.

Fields that reference a vocabulary outside the narrow mirror (for example `occupation`, `marital-status`) fall back to a free-text component so the generator never fails. Operators can swap these for richer components by hand.

## Next steps

- [PublicSchema alignment](../adapters/publicschema-alignment.md) — how DataCollect integrates with PublicSchema-aligned registries.
- [Mock registry server](https://github.com/idpass/idpass-data-collect/tree/main/examples/mock-server) — the reference PublicSchema-compatible registry used for end-to-end sync testing.
