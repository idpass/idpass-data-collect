#!/usr/bin/env bash
# Git safeguards hook — runs as PreToolUse on every Bash call.
#
# Blocks operations that modify remote state or irreversibly destroy local work.
# Exit 2 = block + show message. Exit 0 = allow.

input=$(cat)
command=$(echo "$input" | grep -o '"command":"[^"]*' | cut -d'"' -f4 | head -1)

block() {
  echo "🚫 Blocked by git-safeguards: $1" >&2
  echo "💡 $2" >&2
  exit 2
}

# ── Remote writes ────────────────────────────────────────────────────────────

# git push (all variants, including --force / -f)
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+push(\s|$)'; then
  block "git push is not allowed" \
    "Pushing to remote requires explicit human action."
fi

# git remote set-url (rewiring remotes)
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+remote\s+set-url'; then
  block "git remote set-url is not allowed" \
    "Modifying remote URLs requires explicit human action."
fi

# ── Destructive local operations ─────────────────────────────────────────────

# git reset --hard (discards all uncommitted changes)
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+reset\s+.*--hard'; then
  block "git reset --hard is not allowed" \
    "Use 'git stash' to save work before resetting, or 'git reset' (soft/mixed) to move HEAD safely."
fi

# git clean (removes untracked files — irreversible)
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+clean\s+.*-[a-zA-Z]*f'; then
  block "git clean -f is not allowed" \
    "Removing untracked files is irreversible. Do it manually if intentional."
fi

# git checkout -- / git restore (discards working tree changes)
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+checkout\s+--\s+'; then
  block "git checkout -- is not allowed" \
    "Use 'git stash' to save changes rather than discarding them."
fi
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+restore\s+'; then
  block "git restore is not allowed" \
    "Use 'git stash' to save changes rather than discarding them."
fi

# git branch -D (force-deletes a branch, even if unmerged)
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+branch\s+.*-[a-zA-Z]*D'; then
  block "git branch -D is not allowed" \
    "Force-deleting branches requires explicit human action. Use 'git branch -d' for merged branches."
fi

# git stash drop / clear (loses stashed work)
if echo "$command" | grep -qE '(^|[;&|])\s*git\s+stash\s+(drop|clear)'; then
  block "git stash drop/clear is not allowed" \
    "Dropping stashes is irreversible. Do it manually if intentional."
fi

# ── GitHub CLI remote-mutating operations ────────────────────────────────────

# gh pr merge
if echo "$command" | grep -qE '(^|[;&|])\s*gh\s+pr\s+merge'; then
  block "gh pr merge is not allowed" \
    "Merging pull requests requires explicit human action."
fi

# gh pr close
if echo "$command" | grep -qE '(^|[;&|])\s*gh\s+pr\s+close'; then
  block "gh pr close is not allowed" \
    "Closing pull requests requires explicit human action."
fi

# gh release create/delete/edit
if echo "$command" | grep -qE '(^|[;&|])\s*gh\s+release\s+(create|delete|edit)'; then
  block "gh release $() is not allowed" \
    "Managing releases requires explicit human action."
fi

# gh repo delete
if echo "$command" | grep -qE '(^|[;&|])\s*gh\s+repo\s+delete'; then
  block "gh repo delete is not allowed" \
    "Deleting repositories requires explicit human action."
fi

exit 0
