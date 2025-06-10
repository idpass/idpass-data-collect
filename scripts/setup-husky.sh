#!/bin/bash

# Install Husky
npx husky install

# Create pre-commit hook
npx husky add .husky/pre-commit "npx lint-staged"

echo "✅ Husky pre-commit hook has been set up!"
echo "📝 The hook will check license headers on staged files before each commit."