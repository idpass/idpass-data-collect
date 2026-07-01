# How to Re-run the Security Testing

This guide lets any developer reproduce the security assessment that was run
against DataCollect: the live API attack probes, the durable regression tests
they became, and the static scanners. It also lists the third-party
cybersecurity "skills" the assessment drew on and how to install them.

:::warning Authorized targets only
Only run the offensive probes and scanners against an instance you own or are
explicitly authorized to test — a local stack or your own staging. Never point
them at another party's deployment.
:::

## The skills pack

The assessment used the community
[Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills)
pack (Claude Code "skills"). Install it with:

```bash
npx skills add mukul975/Anthropic-Cybersecurity-Skills
```

It is a large, single-author pack (750+ skills). Review a skill's `SKILL.md`
and `scripts/` before running it, and install only what you need. The skills
that map to DataCollect's stack (TypeScript, Express + PostgreSQL, Vue, JWT,
multi-tenant, Docker, GitHub Actions) are:

**Web application security**
- `exploiting-sql-injection-vulnerabilities`, `performing-second-order-sql-injection` — the backend uses raw SQL in its stores.
- `performing-ssrf-vulnerability-exploitation`, `performing-blind-ssrf-exploitation` — external sync fetches configured URLs.
- `testing-for-xss-vulnerabilities` — the Vue admin/web UIs.
- `testing-for-sensitive-data-exposure`, `performing-security-headers-audit`.

**API security**
- `testing-api-for-broken-object-level-authorization` — multi-tenant IDOR is the top risk.
- `testing-for-json-web-token-vulnerabilities`, `performing-jwt-none-algorithm-attack`, `exploiting-jwt-algorithm-confusion-attack` — JWT auth.
- `testing-api-for-mass-assignment-vulnerability`, `exploiting-excessive-data-exposure-in-api`.
- `performing-api-rate-limiting-bypass`, `detecting-api-enumeration-attacks`.

**Identity & access management**
- `testing-for-broken-access-control`, `exploiting-broken-function-level-authorization`, `bypassing-authentication-with-forced-browsing`.

**DevSecOps**
- `securing-github-actions-workflows`, `detecting-supply-chain-attacks-in-ci-cd`.
- `implementing-secret-scanning-with-gitleaks`, `performing-sca-dependency-scanning-with-snyk`, `scanning-containers-with-trivy-in-cicd`, `implementing-semgrep-for-custom-sast-rules`.

Skills that do **not** apply (no such surface in DataCollect): GraphQL, NoSQL,
WebSocket, OAuth2/OIDC provider, XXE/XML, and insecure deserialization.

## Stand up a local target

Start a throwaway PostgreSQL and point the backend at it:

```bash
docker run -d --name dc-test-pg \
  -e POSTGRES_USER=admin -e POSTGRES_PASSWORD=admin -e POSTGRES_DB=datacollect \
  -p 5433:5432 postgres:15
```

For manual probing against a running server, start the backend and seed demo
data (see the `seed` script in the root `package.json`), then obtain tokens:

```bash
# Admin token
curl -s http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"<admin-password>"}' | jq -r .token
```

Create a second tenant and a `USER`-role account in a different tenant to test
cross-tenant access. See the API reference under **For Developers** for the
`/api/users` and `/api/apps` request shapes.

## Re-run the API attack skills as regression tests

The probe methodologies from the skills above are captured as durable Jest
suites so they can be re-run in CI or locally without a manual proxy. They boot
the real server in-process and drive it with `supertest` against a real
PostgreSQL. Run them with `POSTGRES_TEST` pointed at the throwaway database:

```bash
cd packages/backend
POSTGRES_TEST="postgresql://admin:admin@localhost:5433/datacollect" \
  pnpm test security-
```

The suites under `packages/backend/src/__tests__/` include:

| Suite | Skill it mirrors | What it checks |
| --- | --- | --- |
| `security-tenant-isolation` | BOLA / broken object level authorization | a tenant-A user cannot read/modify tenant-B entities, attachments, or reviews |
| `security-auth` | API authentication weaknesses, JWT | forged/tampered/`alg:none` tokens rejected; protected routes require auth |
| `security-login-timing` | user enumeration via timing | login runs a hash comparison even for unknown emails |
| `security-ratelimit-proxy` | rate-limit bypass | rotating `X-Forwarded-For` cannot defeat the login limiter |
| `security-input-validation` | SQL/argument injection | malformed and injection payloads are rejected, not executed |
| `security-error-handling` | sensitive data exposure | errors do not leak stack traces, paths, or SQL |
| `phase1-backend-hardening`, `security-phase1-fixes` | assorted hardening | regression coverage for earlier fixes |

When adding a new endpoint, add a matching case to the relevant suite — treat a
skill finding as a failing test to be turned green.

## Run the static scanners

These run against the repository, not a live server. On SELinux hosts (e.g.
Fedora) Docker bind mounts need a `:Z` label, and `gitleaks` reads the git
history most reliably from an exported tree.

```bash
# Dependency vulnerabilities (SCA). Triage the runtime subset separately:
pnpm audit
pnpm audit --prod

# SAST (install semgrep separately, e.g. `pipx install semgrep`)
semgrep scan --config p/javascript --config p/owasp-top-ten \
  packages/backend/src packages/datacollect/src

# Secret scanning over tracked files (export first to avoid mount/history issues)
mkdir -p /tmp/dc-scan && git archive HEAD | tar -x -C /tmp/dc-scan
docker run --rm -v /tmp/dc-scan:/repo:Z zricethezav/gitleaks:latest \
  detect --source=/repo --no-git --no-banner --redact

# Container / Dockerfile misconfiguration
docker run --rm -v "$PWD/docker":/docker:Z aquasec/trivy:latest \
  config /docker --severity HIGH,CRITICAL
```

Expect noise: most `pnpm audit` findings are in the dev/build toolchain, and
`gitleaks`/`semgrep` will flag placeholder tokens in tests and docs. Confirm
each finding against the source before acting on it.

## Clean up

```bash
docker rm -f dc-test-pg
rm -rf /tmp/dc-scan
```

## Findings already addressed

The initial assessment confirmed the multi-tenant BOLA defenses hold and the
JWT/auth handling is sound. Fixes that landed from it:

- OTP `devCode` is returned only when `OTP_EXPOSE_DEV_CODE=true`, and the
  backend container runs as a non-root user.
- Login compares a placeholder hash for unknown emails (anti-enumeration), and
  `trust proxy` is configurable via `TRUST_PROXY` (default off) so
  `X-Forwarded-For` cannot be spoofed to bypass rate limiting.

Check the code before re-reporting these.
