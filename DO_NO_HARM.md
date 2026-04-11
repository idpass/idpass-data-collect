# Do No Harm Assessment

This document describes the safeguards built into ID PASS DataCollect to prevent harm and protect the people whose data it manages.

## Context

DataCollect is designed for social protection programs and humanitarian assistance, where it may process sensitive data about vulnerable populations including children, displaced persons, and people in poverty. The software is deployed by organizations that serve these populations, making harm prevention a core design concern.

## Data Privacy and Security Safeguards

### Privacy by Design

- **Offline-first architecture** — data stays on the device by default, reducing exposure surface
- **Data minimization** — only fields defined in entity forms are collected; no hidden data collection
- **No telemetry** — the software does not phone home, track usage, or collect analytics
- **Multi-tenant isolation** — data from different programs is strictly separated

### Security Controls

- **Role-based access control** — admin and field worker roles with different permission levels
- **JWT authentication** — secure, token-based API access
- **Audit trail** — every data change is immutably recorded with user attribution via event sourcing
- **Hash chain verification** — tamper-evident data integrity checks
- **Encryption in transit** — TLS/HTTPS required for all production deployments
- **Device security** — biometric lock and PIN protection on mobile app

### Incident Response

- Security vulnerabilities are handled through a documented process (see [SECURITY.md](SECURITY.md))
- 48-hour acknowledgment, 5-business-day assessment, 30-day resolution target for critical issues
- Coordinated disclosure with security researchers

## Protection of Vulnerable Populations

### Children's Data

DataCollect may process data about minors in household registration scenarios. Deploying organizations must:

- Obtain appropriate parental or guardian consent
- Apply jurisdiction-specific child data protection requirements
- Use role-based access controls to restrict who can view records involving minors

### Displaced Persons and Refugees

When used in humanitarian contexts:

- Offline-first design ensures data is not transmitted over potentially monitored networks unless explicitly synced
- Data can be kept entirely local on field worker devices
- No mandatory cloud dependency reduces risk of data being accessed by hostile actors

### Consent and Transparency

- The software does not collect data autonomously — all data entry is initiated by a human operator
- Deploying organizations are responsible for implementing informed consent procedures
- Entity forms are fully configurable, allowing organizations to include consent fields

## Content Safeguards

DataCollect processes structured beneficiary data (names, household composition, program-specific fields) and supports file attachments (including images) linked to entity records. It does not:

- Host user-generated content (no comments, forums, or social features)
- Enable direct communication between users
- Provide a public-facing content platform

Attachments are stored within the same access-controlled, tenant-isolated infrastructure as entity data. This significantly reduces the risk of the platform being used to distribute harmful or inappropriate content.

## Preventing Misuse

### Access Controls

- All API access requires authentication
- Admin accounts are required to create users and manage programs
- Field workers can only access data within their assigned program

### Data Integrity

- Event sourcing prevents silent modification of records — all changes are tracked
- Hash chain verification detects tampering
- Deletion is recorded as an event (soft delete with audit trail)

### Deployment Guidance

Organizations deploying DataCollect should:

- Follow the security best practices in [SECURITY.md](SECURITY.md)
- Implement data protection policies appropriate to their jurisdiction
- Train field workers on data protection and consent procedures
- Regularly audit access logs and data changes

## Accessibility

DataCollect is built with web standards (HTML, CSS, JavaScript) and is accessible through:

- Standard web browsers (admin interface)
- Mobile devices via Capacitor (mobile app)
- Keyboard navigation support in the admin interface

We welcome accessibility reports and contributions to improve the experience for users with disabilities.

## Environmental Impact

DataCollect's offline-first architecture reduces network usage and server load compared to cloud-dependent alternatives. The software can run on modest hardware, making it suitable for resource-constrained environments.

## Contact

To report concerns about potential harm related to DataCollect:

- **Security issues**: security@acn.fr
- **General concerns**: https://github.com/idpass/idpass-data-collect/issues
- **Organization**: Association pour la Coopération Numérique (ACN) — https://acn.fr
