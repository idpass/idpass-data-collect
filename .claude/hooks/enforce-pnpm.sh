#!/bin/bash
# Block npm/npx usage in favor of pnpm in this workspace

# Read JSON from stdin
input=$(cat)

# Extract command field from JSON
command=$(echo "$input" | grep -o '"command":"[^"]*' | cut -d'"' -f4 | head -1)

# Check if command starts with npm or npx
if [[ "$command" =~ ^npm[[:space:]] ]] || [[ "$command" =~ ^npx[[:space:]] ]]; then
  # Extract the npm command for suggestion
  npm_cmd=$(echo "$command" | cut -d' ' -f1)
  rest=$(echo "$command" | cut -d' ' -f2-)

  # Suggest pnpm equivalent
  if [ "$npm_cmd" = "npm" ]; then
    suggested="pnpm $rest"
  elif [ "$npm_cmd" = "npx" ]; then
    suggested="pnpx $rest"
  fi

  echo "❌ npm is not allowed in this workspace. Use pnpm instead." >&2
  echo "💡 Suggested: $suggested" >&2
  exit 2
fi

exit 0
