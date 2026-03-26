#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.test.yaml"

EXITCODE=0
MANAGED_DOCKER=false
COMPOSE_CMD=""

# Resolve the compose command for Docker or Podman (including when podman is
# aliased as docker, which is common on Fedora/Bazzite systems).
resolve_compose_cmd() {
  if command -v docker &>/dev/null; then
    # docker may be a real Docker installation or a podman alias — either works
    if docker compose version &>/dev/null 2>&1; then
      COMPOSE_CMD="docker compose"
      return 0
    fi
  fi
  if command -v podman &>/dev/null; then
    if podman compose version &>/dev/null 2>&1; then
      COMPOSE_CMD="podman compose"
      return 0
    fi
  fi
  return 1
}

cleanup() {
  if [ "$MANAGED_DOCKER" = true ] && [ -n "$COMPOSE_CMD" ]; then
    echo "Stopping test database..."
    $COMPOSE_CMD -f "$COMPOSE_FILE" down --volumes 2>/dev/null || true
  fi
  exit "$EXITCODE"
}

# If POSTGRES_TEST is already set (e.g. in CI), use it as-is
if [ -z "${POSTGRES_TEST:-}" ]; then
  if ! resolve_compose_cmd; then
    echo "ERROR: neither 'docker compose' nor 'podman compose' is available." >&2
    echo "Install Docker Desktop, Podman with podman-compose, or set POSTGRES_TEST manually." >&2
    exit 1
  fi

  trap cleanup EXIT INT TERM
  MANAGED_DOCKER=true

  echo "Starting test database on port 5433 (via $COMPOSE_CMD)..."
  $COMPOSE_CMD -f "$COMPOSE_FILE" up -d --wait
  export POSTGRES_TEST="postgresql://test:test@localhost:5433/test"
else
  trap cleanup EXIT INT TERM
fi

export JWT_SECRET="${JWT_SECRET:-test-secret}"

echo "Running pr-check with POSTGRES_TEST=$POSTGRES_TEST"
cd "$REPO_ROOT"

pnpm run build:datacollect || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run type-check || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run lint || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm --filter @idpass/data-collect-backend run validate-api || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run test || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run test:e2e:backend || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run test:e2e:admin || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run test:e2e:mobile || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run build || EXITCODE=$?
[ "$EXITCODE" -eq 0 ] && pnpm run check-licenses --fix || EXITCODE=$?
