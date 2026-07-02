# Vendored security-testing skills

This directory contains a **curated, vendored subset** of third-party Claude Code
"skills" used to security-test DataCollect. They are copied here so peers can
re-run the assessment without pulling the full upstream pack.

See [How to Re-run the Security Testing](../../website/docs/how-to/security-testing.md)
for the workflow that uses these skills.

## Provenance & license

- **Source:** https://github.com/mukul975/Anthropic-Cybersecurity-Skills
- **Pinned commit:** `673da1f3b0b7be34ffc9624ef3858fe45f1c3bed`
- **License:** Apache-2.0 — see [`LICENSE`](./LICENSE). DataCollect is also
  Apache-2.0, so redistribution here is compatible. Files are vendored verbatim;
  the upstream Apache-2.0 terms and attribution are retained via this notice and
  the bundled `LICENSE`.

> **Not affiliated with Anthropic.** Despite the upstream repository name, this
> is a community-maintained pack and is not published, endorsed, or reviewed by
> Anthropic. Treat it as untrusted third-party content.

## Safety

Several skills are **offensive** (SQL injection, SSRF, JWT forgery, access-control
bypass). Their `scripts/` send attack payloads. Run them **only** against a local
stack or a system you are explicitly authorized to test. The SSRF skills contain
hardcoded cloud-metadata and loopback payload targets by design — these are the
strings a tester sends to their own target, not calls the scripts make on their
own.

## What's here

24 skills mapped to DataCollect's stack (TypeScript, Express + PostgreSQL, Vue,
JWT, multi-tenant, Docker, GitHub Actions):

**Web application security**
- `exploiting-sql-injection-vulnerabilities`
- `performing-second-order-sql-injection`
- `performing-ssrf-vulnerability-exploitation`
- `performing-blind-ssrf-exploitation`
- `testing-for-xss-vulnerabilities`
- `testing-for-sensitive-data-exposure`
- `performing-security-headers-audit`

**API security**
- `testing-api-for-broken-object-level-authorization`
- `testing-for-json-web-token-vulnerabilities`
- `performing-jwt-none-algorithm-attack`
- `exploiting-jwt-algorithm-confusion-attack`
- `testing-api-for-mass-assignment-vulnerability`
- `exploiting-excessive-data-exposure-in-api`
- `performing-api-rate-limiting-bypass`
- `detecting-api-enumeration-attacks`

**Identity & access management**
- `testing-for-broken-access-control`
- `exploiting-broken-function-level-authorization`
- `bypassing-authentication-with-forced-browsing`

**DevSecOps**
- `securing-github-actions-workflows`
- `detecting-supply-chain-attacks-in-ci-cd`
- `implementing-secret-scanning-with-gitleaks`
- `performing-sca-dependency-scanning-with-snyk`
- `scanning-containers-with-trivy-in-cicd`
- `implementing-semgrep-for-custom-sast-rules`

## Using a skill with Claude Code

Copy the skill directory into your Claude Code skills folder so it is discovered:

```bash
mkdir -p .claude/skills
cp -r security/skills/testing-api-for-broken-object-level-authorization .claude/skills/
```

`.claude/skills/` is git-ignored for personal use; do not commit activated copies.
To pull the entire upstream pack instead, run
`npx skills add mukul975/Anthropic-Cybersecurity-Skills`.

## Updating

Re-vendor from the pinned upstream commit (or a newer one) and update the commit
hash above:

```bash
tmp=$(mktemp -d)
git clone --depth 1 https://github.com/mukul975/Anthropic-Cybersecurity-Skills.git "$tmp"
for d in security/skills/*/; do
  name=$(basename "$d")
  rm -rf "$d" && cp -r "$tmp/skills/$name" "$d" && rm -f "$d/LICENSE"
done
cp "$tmp/LICENSE" security/skills/LICENSE
rm -rf "$tmp"
```
