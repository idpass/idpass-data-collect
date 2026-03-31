#!/bin/bash
# Block npm/npx usage in favor of pnpm in this workspace

# Read JSON from stdin
input=$(cat)

# Extract command field from JSON
command=$(echo "$input" | grep -o '"command":"[^"]*' | cut -d'"' -f4 | head -1)

# Check if command contains npm or npx as a standalone word (catches compound commands like "cd /x && npx foo")
if [[ "$command" =~ (^|[;&|[:space:]])npm[[:space:]] ]] || [[ "$command" =~ (^|[;&|[:space:]])npx[[:space:]] ]]; then
  echo "❌ npm/npx is not allowed in this workspace. Use pnpm/pnpx instead." >&2
  echo "💡 Command: $command" >&2
  exit 2
fi

exit 0
