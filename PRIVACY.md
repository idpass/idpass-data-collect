# Privacy Policy

## Overview

ID PASS DataCollect is an offline-first data management system for household and beneficiary data. This document describes how the software handles personal data and the privacy protections built into its architecture.

ID PASS DataCollect is open-source software deployed and operated by independent organizations. Each deploying organization is the data controller for data processed through their deployment. This document describes the privacy capabilities built into the software itself.

## Data Collected

DataCollect processes the following categories of personal data, as defined by the deploying organization's entity forms:

- **Beneficiary information** — names, household composition, and other fields configured per program
- **System metadata** — timestamps, user IDs, sync status, and event audit trails
- **Authentication credentials** — hashed passwords, JWT tokens (never stored in plaintext)

The exact personal data fields are determined entirely by the deploying organization's form configuration. DataCollect does not impose any fixed schema for personal data.

## Data Minimization

DataCollect follows a data minimization approach:

- Only fields defined in entity forms are collected
- No telemetry, analytics, or usage tracking is built into the software
- No data is sent to third parties unless explicitly configured via external sync adapters

## Data Storage and Protection

### Client-Side (Mobile and Web)

- Data is stored locally in IndexedDB on the user's device
- The application functions fully offline — no network connection is required
- Device-level security features (biometric lock, PIN) protect access to the mobile app

### Server-Side (Backend)

- Data is stored in PostgreSQL with support for encryption at rest
- Multi-tenant architecture ensures data isolation between programs
- TLS/HTTPS is required for all production deployments

### Encryption

- **In transit**: All client-server communication uses HTTPS/TLS
- **At rest**: PostgreSQL encryption at rest is supported; IndexedDB data is protected by device-level encryption

## Audit Trail

DataCollect uses event sourcing — every data change is recorded as an immutable event with:

- Timestamp of the change
- User who made the change
- The change itself (as a structured event)

This provides a complete, tamper-evident audit trail using hash chain verification. Events cannot be modified or deleted after creation.

## Data Retention

Deploying organizations are responsible for defining data retention policies appropriate to their context. DataCollect supports:

- Export of all data in JSON format via the ExportImportManager API
- Deletion of entities through the standard event system
- Database-level retention policies configurable by the operator

## Data Portability

Beneficiary data can be exported in non-proprietary JSON format using:

- The `ExportImportManager` API (programmatic access)
- The admin interface (manual export)
- Direct database access (PostgreSQL standard tools)

See the [Data Export Guide](website/docs/user-guide/data-export.md) for procedures.

## Data Subject Rights

Deploying organizations must implement procedures appropriate to their jurisdiction. DataCollect provides the technical capabilities to support:

- **Right of access** — entity data can be queried and exported per individual
- **Right to rectification** — data can be updated through form submissions (with full audit trail)
- **Right to erasure** — entities can be deleted (deletion events are recorded for auditability)
- **Right to portability** — data export in JSON format

## Children's Data

DataCollect may process data about minors when used for household or individual beneficiary registration. Deploying organizations must:

- Comply with applicable child data protection laws (e.g., COPPA, GDPR Article 8)
- Obtain appropriate consent from parents or guardians
- Apply additional access controls for records involving minors

The software does not distinguish between adult and minor data at the technical level. Deploying organizations should use role-based access controls to restrict access to sensitive records.

## International Data Transfers

DataCollect's sync architecture may transfer data between:

- Client devices and a central server (internal sync)
- The central server and external systems like OpenSPP or OpenFn (external sync)

Deploying organizations are responsible for ensuring that data transfers comply with applicable data protection laws (e.g., GDPR Chapter V).

## Third-Party Integrations

When configured, DataCollect can sync data with external systems:

- **OpenSPP** — social protection platform
- **OpenFn** — integration and interoperability platform

Data shared with external systems is governed by those systems' privacy policies. Deploying organizations must review the data protection practices of any connected system.

## Security

For detailed security measures, vulnerability reporting, and security best practices, see [SECURITY.md](SECURITY.md).

## Contact

- **Maintainer**: Association pour la Cooperation Numerique (ACN)
- **Security issues**: security@acn.fr
- **General inquiries**: https://github.com/idpass/idpass-data-collect/issues
- **Website**: https://acn.fr
