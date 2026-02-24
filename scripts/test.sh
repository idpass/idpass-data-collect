#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$REPO_ROOT/docker-compose.test.yaml"

EXITCODE=0
MANAGED_DOCKER=false

cleanup() {
  if [ "$MANAGED_DOCKER" = true ]; then
    echo "Stopping test database..."
    docker compose -f "$COMPOSE_FILE" down --volumes 2>/dev/null || true
  fi
  exit "$EXITCODE"
}

# If POSTGRES_TEST is already set (e.g. in CI), skip Docker management
if [ -z "${POSTGRES_TEST:-}" ]; then
  if ! command -v docker &>/dev/null; then
    echo "ERROR: docker is not installed or not in PATH" >&2
    echo "Install Docker Desktop or set POSTGRES_TEST manually." >&2
    exit 1
  fi

  trap cleanup EXIT INT TERM
  MANAGED_DOCKER=true

  echo "Starting test database on port 5433..."
  docker compose -f "$COMPOSE_FILE" up -d --wait

  export POSTGRES_TEST="postgresql://test:test@localhost:5433/test"
else
  trap cleanup EXIT INT TERM
fi

export JWT_SECRET="${JWT_SECRET:-test-secret}"

echo "Running tests with POSTGRES_TEST=$POSTGRES_TEST"
cd "$REPO_ROOT"
pnpm -r --if-present run test "$@" || EXITCODE=$?
