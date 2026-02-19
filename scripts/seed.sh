#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/seed-config.json"
CONFIG_ID="demo-household-registry"

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@datacollect.lan}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-correct horse battery staple 42!}"

FIELDWORKER_EMAIL="fieldworker@datacollect.lan"
FIELDWORKER_PASSWORD="fieldworker123"

log() { echo "[seed] $*"; }
fail() { echo "[seed] ERROR: $*" >&2; exit 1; }

# --- Prerequisites ---

if [ ! -f "$CONFIG_FILE" ]; then
  fail "Config file not found: $CONFIG_FILE"
fi

if ! command -v curl &>/dev/null; then
  fail "curl is not installed or not in PATH"
fi

# --- Step 1: Authenticate ---

log "Authenticating as $ADMIN_EMAIL at $BACKEND_URL ..."
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}" \
  2>&1) || fail "Could not connect to backend at $BACKEND_URL. Is it running?"

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  fail "Login failed (HTTP $HTTP_CODE). Check credentials. Response: $LOGIN_BODY"
fi

TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  fail "Failed to extract token from login response: $LOGIN_BODY"
fi

log "Authenticated."

# --- Step 2: Check for existing config (idempotency) ---

log "Checking if config '$CONFIG_ID' exists ..."
CHECK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/apps/$CONFIG_ID" \
  -H "Authorization: Bearer $TOKEN")

if [ "$CHECK_STATUS" = "200" ]; then
  log "WARNING: Config '$CONFIG_ID' already exists. Deleting (this removes all its entity data) ..."
  DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BACKEND_URL/api/apps/$CONFIG_ID" \
    -H "Authorization: Bearer $TOKEN")
  if [ "$DELETE_STATUS" != "200" ]; then
    fail "Failed to delete existing config (HTTP $DELETE_STATUS)"
  fi
  log "Deleted existing config."
fi

# --- Step 3: Upload config ---

log "Uploading demo config ..."
UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/apps" \
  -H "Authorization: Bearer $TOKEN" \
  -F "config=@$CONFIG_FILE;type=application/json")

UPLOAD_CODE=$(echo "$UPLOAD_RESPONSE" | tail -1)
UPLOAD_BODY=$(echo "$UPLOAD_RESPONSE" | sed '$d')

if [ "$UPLOAD_CODE" != "200" ] && [ "$UPLOAD_CODE" != "201" ]; then
  fail "Config upload failed (HTTP $UPLOAD_CODE). Response: $UPLOAD_BODY"
fi

log "Config uploaded."

# --- Step 4: Create field worker user ---

log "Creating field worker user ($FIELDWORKER_EMAIL) ..."
USER_RESPONSE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$FIELDWORKER_EMAIL\", \"password\": \"$FIELDWORKER_PASSWORD\", \"role\": \"user\"}")

USER_CODE=$(echo "$USER_RESPONSE" | tail -1)

if [ "$USER_CODE" = "201" ]; then
  log "Field worker user created."
elif [ "$USER_CODE" = "409" ] || [ "$USER_CODE" = "400" ]; then
  log "Field worker user already exists, skipping."
else
  log "WARNING: Could not create field worker user (HTTP $USER_CODE). Continuing anyway."
fi

# --- Step 5: Verify ---

log "Verifying ..."
VERIFY_RESPONSE=$(curl -s "$BACKEND_URL/api/entities/count?configId=$CONFIG_ID" \
  -H "Authorization: Bearer $TOKEN")

log "Entity count: $VERIFY_RESPONSE"

log ""
log "Seed complete! Demo config '$CONFIG_ID' is ready."
log ""
log "  Admin UI:     http://localhost:5173"
log "  Admin login:  $ADMIN_EMAIL / (your admin password)"
log "  Field worker: $FIELDWORKER_EMAIL / $FIELDWORKER_PASSWORD"
log ""
log "  Data: 4 households, 9 individuals (includes 1 duplicate pair for testing)"
