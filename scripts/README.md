# Scripts

This directory contains utility scripts for the ID PASS DataCollect project.

## License Header Checking

### check-license-headers.js
Main script to check Apache license headers in all source files.

```bash
# Check all files
node scripts/check-license-headers.js

# Automatically add missing headers
node scripts/check-license-headers.js --fix
```

### check-license-headers-staged.js
Used by the pre-commit hook to check only staged files.

## Git Hooks

### setup-husky.sh
One-time setup script to initialize Husky git hooks.

```bash
# Run after npm install
./scripts/setup-husky.sh
```

## Pre-commit Hook

The pre-commit hook automatically runs on every commit to:
1. Check that all staged TypeScript/JavaScript files have proper Apache license headers
2. Prevent commits if license headers are missing

To bypass the hook in emergency situations:
```bash
git commit --no-verify -m "Emergency commit"
```

To add license headers to all files:
```bash
npm run check-licenses:fix
```