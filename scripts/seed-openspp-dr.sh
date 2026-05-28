#!/usr/bin/env bash
# Seed an OpenSPP disability registry assessment for a named registrant.
#
# Run after the DataCollect → OpenSPP push has landed the registrant (so the
# OpenSPP-side res_partner exists). Idempotent — re-running for the same
# registrant returns the existing assessment instead of creating a duplicate.
#
# Usage:
#   ./scripts/seed-openspp-dr.sh "Morgan Cole"
#   ./scripts/seed-openspp-dr.sh "Rin Lee"
#   ./scripts/seed-openspp-dr.sh "Iris Brooks"
#
# Adds a moderate-mobility disability assessment in `approved` state. Adjust
# the SEVERITY_CODE / IMPAIRMENT_CODE env vars to vary.
#
# Prereqs:
#   - OpenSPP up at OPENSPP_URL (default http://localhost:8069)
#   - admin/admin (or OPENSPP_ADMIN_*) able to JSON-RPC
#   - `spp_disability_registry` module installed (`seed-uc3.sh` doesn't
#     install it — install via OpenSPP UI or `seed-openspp-modules.sh`).

set -euo pipefail

REGISTRANT_NAME="${1:-Morgan Cole}"

OPENSPP_URL="${OPENSPP_URL:-http://localhost:8069}"
OPENSPP_DB="${OPENSPP_DB:-openspp}"
OPENSPP_ADMIN_LOGIN="${OPENSPP_ADMIN_LOGIN:-admin}"
OPENSPP_ADMIN_PASSWORD="${OPENSPP_ADMIN_PASSWORD:-admin}"

SEVERITY_CODE="${SEVERITY_CODE:-moderate}"     # mild | moderate | severe | profound
IMPAIRMENT_CODE="${IMPAIRMENT_CODE:-mobility}" # physical | mobility | sensory | visual | hearing | cognitive | ...

log() { echo "[seed-dr] $*"; }
fail() { echo "[seed-dr] ERROR: $*" >&2; exit 1; }

command -v curl >/dev/null || fail "curl required"
command -v jq >/dev/null || fail "jq required"

COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT

# --- 1. authenticate ---------------------------------------------------------
log "Logging in to OpenSPP as $OPENSPP_ADMIN_LOGIN ..."
AUTH=$(curl -s -c "$COOKIE" -X POST "$OPENSPP_URL/web/session/authenticate" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg db "$OPENSPP_DB" --arg lg "$OPENSPP_ADMIN_LOGIN" --arg pw "$OPENSPP_ADMIN_PASSWORD" \
        '{jsonrpc:"2.0",params:{db:$db,login:$lg,password:$pw}}')")
UID_FOUND=$(echo "$AUTH" | jq -r '.result.uid // empty')
[ -n "$UID_FOUND" ] || fail "OpenSPP login failed: $AUTH"

call_kw() {
  # call_kw model method args kwargs
  curl -s -b "$COOKIE" -X POST "$OPENSPP_URL/web/dataset/call_kw" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg m "$1" --arg f "$2" --argjson a "$3" --argjson k "$4" \
          '{jsonrpc:"2.0",params:{model:$m,method:$f,args:$a,kwargs:$k}}')"
}

# --- 2. find module + ensure installed --------------------------------------
DR_STATE=$(call_kw "ir.module.module" "search_read" \
  '[[["name","=","spp_disability_registry"]],["id","state"]]' '{"limit":1}' \
  | jq -r '.result[0].state // empty')
if [ "$DR_STATE" != "installed" ]; then
  fail "spp_disability_registry not installed (state=$DR_STATE). Install via OpenSPP Apps UI first."
fi

# --- 3. find registrant ------------------------------------------------------
log "Searching for registrant '$REGISTRANT_NAME' on OpenSPP ..."
REG_RES=$(call_kw "res.partner" "search_read" \
  "[[[\"name\",\"=\",\"$REGISTRANT_NAME\"],[\"is_registrant\",\"=\",true]],[\"id\",\"name\",\"is_group\"]]" \
  '{"limit":1}')
REG_ID=$(echo "$REG_RES" | jq -r '.result[0].id // empty')
[ -n "$REG_ID" ] || fail "Registrant '$REGISTRANT_NAME' not found. Has the DataCollect sync pushed the household? Try the admin UI 'Sync now' first."
log "  Found registrant id=$REG_ID"

# --- 4. idempotency: existing assessment? ------------------------------------
EXISTING=$(call_kw "spp.disability.assessment" "search_read" \
  "[[[\"registrant_id\",\"=\",$REG_ID]],[\"id\",\"name\",\"approval_state\"]]" \
  '{"limit":1}')
EXISTING_ID=$(echo "$EXISTING" | jq -r '.result[0].id // empty')
if [ -n "$EXISTING_ID" ]; then
  log "  Assessment already exists (id=$EXISTING_ID, state=$(echo "$EXISTING" | jq -r '.result[0].approval_state')). Skipping."
  exit 0
fi

# --- 5. resolve vocab codes --------------------------------------------------
SEVERITY_ID=$(call_kw "spp.vocabulary.code" "search" \
  "[[[\"uri\",\"=\",\"urn:dci:cd:dr:02#$SEVERITY_CODE\"]]]" '{"limit":1}' \
  | jq -r '.result[0] // empty')
[ -n "$SEVERITY_ID" ] || fail "Unknown severity '$SEVERITY_CODE'. Valid: mild | moderate | severe | profound."

IMPAIRMENT_ID=$(call_kw "spp.vocabulary.code" "search" \
  "[[[\"uri\",\"=\",\"urn:dci:cd:dr:01#$IMPAIRMENT_CODE\"]]]" '{"limit":1}' \
  | jq -r '.result[0] // empty')
[ -n "$IMPAIRMENT_ID" ] || fail "Unknown impairment '$IMPAIRMENT_CODE'. Try: mobility | visual | hearing | cognitive | physical | sensory ..."

# --- 6. create assessment ----------------------------------------------------
TODAY=$(date -u +%Y-%m-%d)
log "Creating disability assessment ($SEVERITY_CODE / $IMPAIRMENT_CODE) for registrant id=$REG_ID ..."
CREATE=$(call_kw "spp.disability.assessment" "create" \
  "[[{\
    \"registrant_id\": $REG_ID,\
    \"assessment_date\": \"$TODAY\",\
    \"assessment_type\": \"wg_ss\",\
    \"severity_level_id\": $SEVERITY_ID,\
    \"impairment_type_ids\": [[6, false, [$IMPAIRMENT_ID]]],\
    \"wg_walking\": \"a_lot\",\
    \"wg_seeing\": \"none\",\
    \"wg_hearing\": \"none\",\
    \"wg_remembering\": \"none\",\
    \"wg_selfcare\": \"some\",\
    \"wg_communicating\": \"none\"\
  }]]" '{}')
# `create` for a single record returns an int (or a single-element list,
# depending on Odoo version) — unwrap both cases.
A_ID=$(echo "$CREATE" | jq -r '
  if .result|type == "array" then .result[0]
  else .result end
  // empty')
[ -n "$A_ID" ] || fail "Assessment create failed: $CREATE"

# --- 7. submit + approve so the record counts toward eligibility ------------
# Try the spp.approval.mixin workflow first (draft → submit → pending → approve).
# Configuring the workflow definition in OpenSPP is an admin step that the
# demo presenter may skip; if so, fall back to a direct write of
# `approval_state='approved'` (demo-only shortcut — not a production path).
SUBMIT=$(call_kw "spp.disability.assessment" "action_submit_for_approval" "[[$A_ID]]" '{}')
APPROVE=$(call_kw "spp.disability.assessment" "action_approve" "[[$A_ID]]" '{}')

STATE=$(call_kw "spp.disability.assessment" "read" "[[$A_ID],[\"approval_state\"]]" '{}' \
  | jq -r '.result[0].approval_state // "unknown"')

if [ "$STATE" != "approved" ]; then
  log "  Approval workflow not configured (state=$STATE). Bypassing via direct write — DEMO ONLY."
  call_kw "spp.disability.assessment" "write" "[[$A_ID], {\"approval_state\": \"approved\"}]" '{}' > /dev/null
  STATE=$(call_kw "spp.disability.assessment" "read" "[[$A_ID],[\"approval_state\"]]" '{}' \
    | jq -r '.result[0].approval_state // "unknown"')
fi

log "Assessment id=$A_ID for $REGISTRANT_NAME is now in state '$STATE'"
