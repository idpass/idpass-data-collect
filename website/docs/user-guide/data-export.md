---
title: Data Export
sidebar_position: 2
---

# Data Export

DataCollect supports exporting beneficiary data in non-proprietary formats for portability, backup, and compliance with data subject rights.

## Export Methods

### Programmatic Export (ExportImportManager API)

The core library provides an `ExportImportManager` interface for exporting all data:

```typescript
import { ExportImportManager } from '@idpass/data-collect-core'

// Export as JSON
const jsonBuffer = await exportImportManager.exportData('json')

// Export as binary
const binaryBuffer = await exportImportManager.exportData('binary')
```

**Formats:**
- `json` — human-readable JSON; suitable for interoperability with other systems
- `binary` — compact binary format; suitable for backups and full data transfers

### Direct Database Export

For server-side deployments, data can be exported using standard PostgreSQL tools:

```bash
# Export all entities for a specific program
pg_dump -t entities -t events --data-only your_database > export.sql

# Export as CSV
psql your_database -c "COPY (SELECT * FROM entities WHERE config_id = 'your-program-id') TO STDOUT WITH CSV HEADER" > entities.csv
```

## Data Format

### JSON Export Structure

Exported JSON contains:

- **entities** — current state of all groups and individuals
- **events** — complete event history (audit trail)
- **metadata** — export timestamp, program ID, version

### Importing Exported Data

Data exported in JSON or binary format can be imported into another DataCollect instance:

```typescript
const importResult = await exportImportManager.importData(buffer)
console.log(`Imported ${importResult.importedEntities} entities`)
```

## Use Cases

- **Data portability** — move beneficiary data between DataCollect deployments
- **Backup** — create regular exports for disaster recovery
- **Compliance** — fulfill data subject access requests (right of access, right to portability)
- **Migration** — move data to or from other systems using JSON as an interchange format
- **Audit** — export event history for external review

## Related

- [ExportImportManager API Reference](../packages/datacollect/api/interfaces/ExportImportManager.md)
- [Import OpenSPP Fields](./import-openspp-fields.md)
