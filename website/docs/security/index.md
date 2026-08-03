---
id: security-overview
title: Security
sidebar_label: Overview
sidebar_position: 1
description: Security policy, supported versions, and coordinated disclosure for ID PASS DataCollect.
---

# Security

ID PASS DataCollect handles sensitive household and individual beneficiary data. We treat
the confidentiality, integrity, and availability of that data as a first-order concern and
welcome coordinated disclosure from the security community.

If you believe you have found a vulnerability, please **do not open a public GitHub issue**.
Follow [Report a vulnerability](./report-a-vulnerability.md).

## Supported versions

Security fixes are released for the current major line. We recommend always running the
latest stable release.

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | ✅ Yes             |
| < 2.0   | ❌ No (upgrade)    |

## What we protect

DataCollect is offline-first and multi-tenant, so the security model spans the client
library, the sync server, and external-system adapters:

- **Tenant isolation** — each program's entities and events are scoped to its tenant; no
  cross-tenant read or write.
- **Authentication & authorization** — JWT-based access with role checks; per-entity
  authorization on group members.
- **Event integrity** — an append-only, hash-chained event store provides a tamper-evident
  audit trail.
- **Sync integrity** — server-managed fields are sanitized at every ingestion boundary, and
  external identifiers are resolved server-side.
- **Data minimization at the edge** — public configuration artifacts are stripped of secrets
  and seeded data; internal fields are removed from sync payloads.

## Coordinated disclosure

We follow a coordinated-disclosure process so that users can upgrade before details are
public:

1. **Report received** — we acknowledge and triage the private report.
2. **Verify & assess** — we reproduce the issue and assess severity and impact.
3. **Fix privately** — the fix is developed in a private
   [GitHub Security Advisory](https://docs.github.com/en/code-security/security-advisories)
   draft, not in public commits.
4. **Release** — we ship a patched version.
5. **Disclose** — we publish the advisory (and request a CVE where warranted) **after** users
   can upgrade, crediting the reporter unless they prefer to remain anonymous.

Our aim is timing, not permanent secrecy: once a fix is available, transparency helps
everyone.

## Response targets

| Stage              | Target                                  |
| ------------------ | --------------------------------------- |
| Acknowledgement    | within 2 business days                  |
| Initial assessment | within 5 business days                  |
| Fix for confirmed critical issues | prioritized; typically within 30 days |

## Recognition

We credit researchers who responsibly disclose valid vulnerabilities in the published
advisory (with your permission). We do not currently run a paid bug-bounty program.

## Operating DataCollect securely

Deployment hardening is the operator's responsibility. See the
[deployment guides](/deployment/) for the current baseline, which includes: serving over
TLS, setting a strong `JWT_SECRET` (≥ 32 characters), an explicit `CORS_ORIGINS` allow-list,
strong database and admin credentials (no weak fallbacks), and running the backend container
as a non-root user.
