#!/usr/bin/env bash
# UC3 (disabled-widow enrolment) demo seed.
#
# Wires a DataCollect tenant configured to push program enrolments to OpenSPP
# via the assign_program ChangeRequest workflow.
#
# Prerequisites
# -------------
#  • DataCollect backend reachable at $BACKEND_URL (default http://localhost:3000)
#  • OpenSPP V2 reachable at $OPENSPP_URL with modules installed:
#      spp_api_v2, spp_api_v2_change_request,
#      spp_cr_type_assign_program, spp_programs
#  • An OpenSPP API V2 client with scopes:
#      change_request:all  group:all  individual:all  identifier:all
#    Export its credentials as OPENSPP_CLIENT_ID + OPENSPP_CLIENT_SECRET.
#  • OpenSPP admin credentials (default admin/admin) reachable via JSON-RPC for
#    program creation. Override with OPENSPP_ADMIN_LOGIN / OPENSPP_ADMIN_PASSWORD.
#
# What this script does
# ---------------------
#  1. Ensures a `Widow Disability Support` program exists on OpenSPP and grabs
#     its primary key. Idempotent.
#  2. Substitutes ${OPENSPP_URL}, ${OPENSPP_CLIENT_ID}, ${OPENSPP_CLIENT_SECRET},
#     ${OPENSPP_PROGRAM_ID} into seed-config-uc3-widow.json.
#  3. Uploads the rewritten config to DataCollect.
#  4. Ensures the fieldworker user can authenticate against the tenant.
#
# Re-runnable. Existing tenant + program get reused.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_TEMPLATE="$SCRIPT_DIR/seed-config-uc3-widow.json"
CONFIG_ID="uc3-widow-enrolment"
PROGRAM_NAME="Widow Disability Support"
PROGRAM_TARGET_TYPE="group"
UC3_ARTIFACTS_DIR="$SCRIPT_DIR/uc3-demo-artifacts"
UC3_ISSUER_PUB_FILE="$UC3_ARTIFACTS_DIR/issuer-ed25519.pub.b64"

BACKEND_URL="${BACKEND_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@datacollect.lan}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Correct horse battery staple 42!}"

FIELDWORKER_EMAIL="${FIELDWORKER_EMAIL:-fieldworker@datacollect.lan}"
FIELDWORKER_PASSWORD="${FIELDWORKER_PASSWORD:-fieldworker123}"

OPENSPP_URL="${OPENSPP_URL:-http://localhost:8069}"
OPENSPP_DB="${OPENSPP_DB:-openspp}"
OPENSPP_ADMIN_LOGIN="${OPENSPP_ADMIN_LOGIN:-admin}"
OPENSPP_ADMIN_PASSWORD="${OPENSPP_ADMIN_PASSWORD:-admin}"
OPENSPP_CLIENT_ID="${OPENSPP_CLIENT_ID:-}"
OPENSPP_CLIENT_SECRET="${OPENSPP_CLIENT_SECRET:-}"

log() { echo "[seed-uc3] $*"; }
fail() { echo "[seed-uc3] ERROR: $*" >&2; exit 1; }

[ -f "$CONFIG_TEMPLATE" ] || fail "Config template not found: $CONFIG_TEMPLATE"
command -v curl >/dev/null || fail "curl required"
command -v jq >/dev/null || fail "jq required (sudo apt install jq / brew install jq)"

[ -n "$OPENSPP_CLIENT_ID" ] || fail "Set OPENSPP_CLIENT_ID (OpenSPP API V2 client id)"
[ -n "$OPENSPP_CLIENT_SECRET" ] || fail "Set OPENSPP_CLIENT_SECRET"

# --- Step 1: ensure OpenSPP program exists -----------------------------------

log "Probing OpenSPP at $OPENSPP_URL ..."
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  "$OPENSPP_URL/web/health" 2>/dev/null || echo "000")
[ "$HEALTH_CODE" = "200" ] || fail "OpenSPP not reachable at $OPENSPP_URL (HTTP $HEALTH_CODE)"

OPENSPP_COOKIE="$(mktemp)"
trap 'rm -f "$OPENSPP_COOKIE"' EXIT

log "Authenticating OpenSPP session as $OPENSPP_ADMIN_LOGIN ..."
SESSION_RES=$(curl -s -c "$OPENSPP_COOKIE" -X POST "$OPENSPP_URL/web/session/authenticate" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg db "$OPENSPP_DB" --arg lg "$OPENSPP_ADMIN_LOGIN" --arg pw "$OPENSPP_ADMIN_PASSWORD" \
        '{jsonrpc:"2.0",params:{db:$db,login:$lg,password:$pw}}')")
UID_FOUND=$(echo "$SESSION_RES" | jq -r '.result.uid // empty')
[ -n "$UID_FOUND" ] || fail "OpenSPP login failed. Response: $SESSION_RES"

log "Searching for program '$PROGRAM_NAME' ..."
SEARCH_RES=$(curl -s -b "$OPENSPP_COOKIE" -X POST "$OPENSPP_URL/web/dataset/call_kw" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg name "$PROGRAM_NAME" \
        '{jsonrpc:"2.0",params:{model:"spp.program",method:"search_read",args:[[["name","=",$name]],["id","name","state"]],kwargs:{limit:1}}}')")
PROGRAM_ID=$(echo "$SEARCH_RES" | jq -r '.result[0].id // empty')

if [ -z "$PROGRAM_ID" ]; then
  log "Creating program '$PROGRAM_NAME' on OpenSPP ..."
  CREATE_RES=$(curl -s -b "$OPENSPP_COOKIE" -X POST "$OPENSPP_URL/web/dataset/call_kw" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg name "$PROGRAM_NAME" --arg tt "$PROGRAM_TARGET_TYPE" \
          '{jsonrpc:"2.0",params:{model:"spp.program",method:"create",args:[{name:$name,target_type:$tt,state:"active"}],kwargs:{}}}')")
  PROGRAM_ID=$(echo "$CREATE_RES" | jq -r '.result // empty')
  [ -n "$PROGRAM_ID" ] || fail "Failed to create program: $CREATE_RES"
  log "Created program id=$PROGRAM_ID"
else
  log "Found existing program id=$PROGRAM_ID"
fi

# Ensure the OpenSPP FastAPI endpoint serves requests as the admin user — the
# default "public" role is fenced out of Change Request groups.
log "Ensuring OpenSPP FastAPI endpoint user is admin ..."
EP_RES=$(curl -s -b "$OPENSPP_COOKIE" -X POST "$OPENSPP_URL/web/dataset/call_kw" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","params":{"model":"fastapi.endpoint","method":"search_read","args":[[["app","=","api_v2"]],["id","name","user_id"]],"kwargs":{"limit":1}}}')
EP_ID=$(echo "$EP_RES" | jq -r '.result[0].id // empty')
EP_USER_NAME=$(echo "$EP_RES" | jq -r '.result[0].user_id[1] // empty')
if [ -n "$EP_ID" ] && [ "$EP_USER_NAME" != "Mitchell Admin" ] && [ "$EP_USER_NAME" != "Administrator" ]; then
  ADMIN_RES=$(curl -s -b "$OPENSPP_COOKIE" -X POST "$OPENSPP_URL/web/dataset/call_kw" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","params":{"model":"res.users","method":"search","args":[[["login","=","admin"]]],"kwargs":{"limit":1}}}')
  ADMIN_UID=$(echo "$ADMIN_RES" | jq -r '.result[0] // empty')
  if [ -n "$ADMIN_UID" ]; then
    curl -s -b "$OPENSPP_COOKIE" -X POST "$OPENSPP_URL/web/dataset/call_kw" \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"params\":{\"model\":\"fastapi.endpoint\",\"method\":\"write\",\"args\":[[$EP_ID],{\"user_id\":$ADMIN_UID}],\"kwargs\":{}}}" >/dev/null
    log "  FastAPI endpoint user set to admin (uid=$ADMIN_UID)."
  fi
fi

# --- Step 2: render tenant config --------------------------------------------

# Look for the Claim-169 issuer public key. If not present, fall back to a
# placeholder so the seed still works (Claim-169 verification will fail at
# scan time — see runbook for how to mint a real demo VC).
if [ -f "$UC3_ISSUER_PUB_FILE" ]; then
  UC3_ISSUER_ED25519_PUB_B64="$(tr -d '\n' < "$UC3_ISSUER_PUB_FILE")"
  log "Loaded Claim-169 issuer public key from $UC3_ISSUER_PUB_FILE"
else
  UC3_ISSUER_ED25519_PUB_B64="UNCONFIGURED-RUN-mint-uc3-demo-vc.mjs"
  log "WARNING: $UC3_ISSUER_PUB_FILE not found. Claim-169 scan verification will fail until you run:"
  log "  cd packages/mobile && node scripts/mint-uc3-demo-vc.mjs"
fi

# numeric program_id; everything else string-safe
CONFIG_TMP=$(mktemp --suffix=.json)
trap 'rm -f "$OPENSPP_COOKIE" "$CONFIG_TMP"' EXIT

jq \
  --arg url        "$OPENSPP_URL" \
  --arg cid        "$OPENSPP_CLIENT_ID" \
  --arg csec       "$OPENSPP_CLIENT_SECRET" \
  --arg pubkey     "$UC3_ISSUER_ED25519_PUB_B64" \
  --argjson progid "$PROGRAM_ID" \
  '
    .externalSync.url = $url
    | .externalSync.adapterConfig.clientId = $cid
    | .externalSync.adapterConfig.clientSecret = $csec
    | .programs[0].id = $progid
    | (.entityForms[] | select(.name == "widow") | .formio.components[] | select(.type == "claim169Scanner") | .trustedIssuers[0].publicKey.ed25519) |= $pubkey
  ' "$CONFIG_TEMPLATE" > "$CONFIG_TMP"

# --- Step 3: upload to DataCollect -------------------------------------------

log "Authenticating to DataCollect backend at $BACKEND_URL ..."
LOGIN_RES=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/users/login" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg em "$ADMIN_EMAIL" --arg pw "$ADMIN_PASSWORD" '{email:$em,password:$pw}')")
LOGIN_CODE=$(echo "$LOGIN_RES" | tail -1)
LOGIN_BODY=$(echo "$LOGIN_RES" | sed '$d')
[ "$LOGIN_CODE" = "200" ] || fail "DataCollect login failed (HTTP $LOGIN_CODE). $LOGIN_BODY"
TOKEN=$(echo "$LOGIN_BODY" | jq -r '.token // empty')
[ -n "$TOKEN" ] || fail "Could not parse token from: $LOGIN_BODY"

EXISTS=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/apps/$CONFIG_ID" \
  -H "Authorization: Bearer $TOKEN")
if [ "$EXISTS" = "200" ]; then
  log "Tenant '$CONFIG_ID' exists — deleting before re-upload."
  curl -s -o /dev/null -X DELETE "$BACKEND_URL/api/apps/$CONFIG_ID" \
    -H "Authorization: Bearer $TOKEN"
fi

log "Uploading tenant config ..."
UPLOAD_RES=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/apps" \
  -H "Authorization: Bearer $TOKEN" \
  -F "config=@$CONFIG_TMP;type=application/json")
UPLOAD_CODE=$(echo "$UPLOAD_RES" | tail -1)
[ "$UPLOAD_CODE" = "200" ] || [ "$UPLOAD_CODE" = "201" ] || fail "Config upload failed (HTTP $UPLOAD_CODE). $(echo "$UPLOAD_RES" | sed '$d')"

# --- Step 4: ensure fieldworker user can sync this tenant --------------------

log "Ensuring fieldworker user exists ..."
FW_CREATE=$(curl -s -w "\n%{http_code}" "$BACKEND_URL/api/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg em "$FIELDWORKER_EMAIL" --arg pw "$FIELDWORKER_PASSWORD" --arg tid "$CONFIG_ID" \
        '{email:$em,password:$pw,role:"USER",tenantIds:[$tid]}')")
FW_CODE=$(echo "$FW_CREATE" | tail -1)
case "$FW_CODE" in
  201) log "  Fieldworker created.";;
  409|400) log "  Fieldworker already exists — patching tenant assignment ...";
    FW_ID=$(curl -s "$BACKEND_URL/api/users" -H "Authorization: Bearer $TOKEN" \
      | jq -r --arg em "$FIELDWORKER_EMAIL" '.[] | select(.email==$em) | .id // empty')
    if [ -n "$FW_ID" ]; then
      curl -s -o /dev/null -X PUT "$BACKEND_URL/api/users/$FW_ID" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg em "$FIELDWORKER_EMAIL" --arg tid "$CONFIG_ID" \
              '{email:$em,role:"USER",tenantIds:[$tid]}')"
      log "  Patched."
    fi
    ;;
  *) log "  WARNING: fieldworker create returned HTTP $FW_CODE";;
esac

log ""
log "UC3 demo seed complete."
log ""
log "  Tenant id:         $CONFIG_ID"
log "  OpenSPP program:   $PROGRAM_NAME (id=$PROGRAM_ID)"
log "  Admin UI:          http://localhost:5173"
log "  Fieldworker login: $FIELDWORKER_EMAIL / $FIELDWORKER_PASSWORD"
log ""
log "Next: on the mobile/admin tenant, the 'Enrol in Program' button on the"
log "household detail view submits an enrol-in-program event. On next sync the"
log "adapter pushes one /ChangeRequest with requestType.code=assign_program to"
log "OpenSPP. An OpenSPP operator must \$approve + \$apply the CR for the"
log "membership to land in the spp_programs registry."
