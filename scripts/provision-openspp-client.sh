#!/usr/bin/env bash
# Provision an OpenSPP V2 API client + scopes via JSON-RPC, then print the
# OPENSPP_CLIENT_ID / OPENSPP_CLIENT_SECRET env-var lines ready to source.
#
# Idempotent: reuses an existing client by name; only regenerates the secret
# (which means the printed creds are fresh — overwrite any previous .env entry).
#
# Usage:
#   eval "$(./scripts/provision-openspp-client.sh datacollect-uc3-demo)"
# or:
#   ./scripts/provision-openspp-client.sh datacollect-uc3-demo > /tmp/openspp.env

set -euo pipefail

CLIENT_NAME="${1:-datacollect-uc3-demo}"

OPENSPP_URL="${OPENSPP_URL:-http://localhost:8069}"
OPENSPP_DB="${OPENSPP_DB:-openspp}"
OPENSPP_ADMIN_LOGIN="${OPENSPP_ADMIN_LOGIN:-admin}"
OPENSPP_ADMIN_PASSWORD="${OPENSPP_ADMIN_PASSWORD:-admin}"

log() { echo "# [provision] $*" >&2; }
fail() { echo "# [provision] ERROR: $*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl required"
command -v jq >/dev/null || fail "jq required"

COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT

# --- 1. authenticate as admin -----------------------------------------------
log "Authenticating OpenSPP session as $OPENSPP_ADMIN_LOGIN ..."
AUTH=$(curl -s -c "$COOKIE" -X POST "$OPENSPP_URL/web/session/authenticate" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg db "$OPENSPP_DB" --arg lg "$OPENSPP_ADMIN_LOGIN" --arg pw "$OPENSPP_ADMIN_PASSWORD" \
        '{jsonrpc:"2.0",params:{db:$db,login:$lg,password:$pw}}')")
UID_FOUND=$(echo "$AUTH" | jq -r '.result.uid // empty')
[ -n "$UID_FOUND" ] || fail "OpenSPP login failed: $AUTH"

call_kw() {
  curl -s -b "$COOKIE" -X POST "$OPENSPP_URL/web/dataset/call_kw" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg m "$1" --arg f "$2" --argjson a "$3" --argjson k "$4" \
          '{jsonrpc:"2.0",params:{model:$m,method:$f,args:$a,kwargs:$k}}')"
}

# --- 2. find or create the API client ---------------------------------------
log "Searching for existing API client '$CLIENT_NAME' ..."
EXISTING=$(call_kw "spp.api.client" "search_read" \
  "[[[\"name\",\"=\",\"$CLIENT_NAME\"]],[\"id\",\"client_id\"]]" '{"limit":1}')
CLIENT_DB_ID=$(echo "$EXISTING" | jq -r '.result[0].id // empty')
CLIENT_OAUTH_ID=$(echo "$EXISTING" | jq -r '.result[0].client_id // empty')

if [ -z "$CLIENT_DB_ID" ]; then
  log "Creating API client '$CLIENT_NAME' ..."
  # Need a partner_id + organization_type_id. Use admin's partner as a sensible default;
  # operators can edit later via the UI.
  ADMIN_PARTNER=$(call_kw "res.users" "read" "[[2],[\"partner_id\"]]" '{}' \
    | jq -r '.result[0].partner_id[0] // 3')
  # Organization type for category-based consent (required by spp.api.client).
  # Prefer "ngo" if available; fall back to whatever's seeded.
  ORG_TYPE=$(call_kw "spp.consent.org.type" "search" '[[["code","=","ngo"]]]' '{"limit":1}' \
    | jq -r '.result[0] // empty')
  if [ -z "$ORG_TYPE" ]; then
    ORG_TYPE=$(call_kw "spp.consent.org.type" "search" '[[]]' '{"limit":1}' \
      | jq -r '.result[0] // empty')
  fi
  [ -n "$ORG_TYPE" ] || fail "No spp.consent.org.type record exists — spp_api_v2 consent vocabulary not seeded"

  CREATE_RES=$(call_kw "spp.api.client" "create" \
    "[[{\"name\":\"$CLIENT_NAME\",\"partner_id\":$ADMIN_PARTNER,\"organization_type_id\":$ORG_TYPE,\"auth_type\":\"oauth2\",\"active\":true,\"is_organization_type_verified\":true}]]" \
    '{}')
  # Odoo 19's @api.model_create_multi returns `[id]` even for a single record.
  CLIENT_DB_ID=$(echo "$CREATE_RES" | jq -r '
    if .result|type == "array" then .result[0]
    else .result end // empty')
  [ -n "$CLIENT_DB_ID" ] || fail "Client create failed: $CREATE_RES"
  log "  Created spp.api.client id=$CLIENT_DB_ID"
fi

# --- 3. grant scopes (idempotent — search before create) --------------------
SCOPES=("change_request:all" "group:all" "individual:all" "identifier:all")
for scope in "${SCOPES[@]}"; do
  resource="${scope%%:*}"
  action="${scope##*:}"
  EXIST=$(call_kw "spp.api.client.scope" "search" \
    "[[[\"client_id\",\"=\",$CLIENT_DB_ID],[\"resource\",\"=\",\"$resource\"],[\"action\",\"=\",\"$action\"]]]" '{"limit":1}')
  if [ "$(echo "$EXIST" | jq -r '.result | length // 0')" = "0" ]; then
    call_kw "spp.api.client.scope" "create" \
      "[[{\"client_id\":$CLIENT_DB_ID,\"resource\":\"$resource\",\"action\":\"$action\"}]]" '{}' >/dev/null
    log "  Granted scope $scope"
  fi
done

# --- 4. regenerate secret (single source of truth — always print fresh) -----
log "Regenerating client secret ..."
REGEN=$(call_kw "spp.api.client" "action_regenerate_secret" "[[$CLIENT_DB_ID]]" '{}')
WIZARD_ID=$(echo "$REGEN" | jq -r '.result.res_id // empty')
[ -n "$WIZARD_ID" ] || fail "action_regenerate_secret returned no wizard: $REGEN"

CREDS=$(call_kw "spp.api.client.show.secret.wizard" "read" \
  "[[$WIZARD_ID],[\"oauth_client_id\",\"client_secret\"]]" '{}')
CLIENT_OAUTH_ID=$(echo "$CREDS" | jq -r '.result[0].oauth_client_id')
CLIENT_SECRET=$(echo "$CREDS" | jq -r '.result[0].client_secret')
[ -n "$CLIENT_OAUTH_ID" ] && [ -n "$CLIENT_SECRET" ] || fail "Failed to read credentials"

# --- 5. patch the FastAPI endpoint to run as admin --------------------------
# Default `public` user is fenced out of Change-Request groups.
log "Ensuring /api/v2 FastAPI endpoint user is admin ..."
EP=$(call_kw "fastapi.endpoint" "search_read" \
  '[[["app","=","api_v2"]],["id","user_id"]]' '{"limit":1}')
EP_ID=$(echo "$EP" | jq -r '.result[0].id // empty')
EP_USER_NAME=$(echo "$EP" | jq -r '.result[0].user_id[1] // empty')
if [ -n "$EP_ID" ] && [ "$EP_USER_NAME" != "Mitchell Admin" ] && [ "$EP_USER_NAME" != "Administrator" ]; then
  ADMIN_UID=$(call_kw "res.users" "search" '[[["login","=","admin"]]]' '{"limit":1}' \
    | jq -r '.result[0] // empty')
  [ -n "$ADMIN_UID" ] && call_kw "fastapi.endpoint" "write" "[[$EP_ID],{\"user_id\":$ADMIN_UID}]" '{}' >/dev/null
  log "  Patched."
fi

# --- 6. emit eval-able exports ---------------------------------------------
cat <<EOF
export OPENSPP_CLIENT_ID='$CLIENT_OAUTH_ID'
export OPENSPP_CLIENT_SECRET='$CLIENT_SECRET'
EOF
log "Done. Source the output to load OPENSPP_CLIENT_ID + OPENSPP_CLIENT_SECRET."
