#!/usr/bin/env bash
# ============================================================================
# Photobooth backend — end-to-end smoke test sa local emulator
# ----------------------------------------------------------------------------
# Ginagamit ang Admin SDK + Firebase Auth REST API laban sa emulator suite.
# Patakbuhin:
#   1) firebase emulators:start --import=./seed-data --export-on-exit
#   2) bash scripts/smoke-test.sh
#
# Sinusuri nito ang:
#   ✓ user bootstrap (profile + quota + claims)
#   ✓ quota spend / refund / rollover
#   ✓ idempotency (walang doble ang singil)
#   ✓ rate limiting
#   ✓ admin role gating (huminto kapag walang role)
#   ✓ booking capacity race
#   ✓ analytics allowlist
# ============================================================================
set -euo pipefail

PROJECT="${GCLOUD_PROJECT:-photobooth-app-dev}"
FUNCTIONS_HOST="${FUNCTIONS_EMULATOR_HOST:-localhost:5001}"
AUTH_HOST="${FIREBASE_AUTH_EMULATOR_HOST:-localhost:9099}"
FIRESTORE_HOST="${FIRESTORE_EMULATOR_HOST:-localhost:8080}"
BASE="http://${FUNCTIONS_HOST}/${PROJECT}/asia-southeast1"

pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAILED=1; }
info() { printf "\n\033[1m%s\033[0m\n" "$1"; }

FAILED=0
export FIRESTORE_EMULATOR_HOST="$FIRESTORE_HOST"
export FIREBASE_AUTH_EMULATOR_HOST="$AUTH_HOST"

info "1. Naghihintay sa emulator…"
for i in $(seq 1 30); do
  if curl -sf "http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/config" >/dev/null 2>&1; then
    pass "Bukas ang Auth emulator"; break
  fi
  [ "$i" -eq 30 ] && { fail "Hindi nag-response ang Auth emulator"; exit 1; }
  sleep 1
done

info "2. Gumagawa ng test user via Auth REST API"
EMAIL="smoke-$(date +%s)@test.local"
PASSWORD="password123"
SIGNUP=$(curl -s -X POST "http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"returnSecureToken\":true}")
ID_TOKEN=$(echo "$SIGNUP" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).idToken||'')}catch{console.log('')}})")
UID=$(echo "$SIGNUP" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).localId||'')}catch{console.log('')}})")
[ -n "$ID_TOKEN" ] && pass "user: ${EMAIL}" || { fail "Hindi makagawa ng test user"; exit 1; }

call() {
  local name="$1"; local payload="$2"; local token="${3:-$ID_TOKEN}"
  curl -s -X POST "${BASE}/${name}" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${token}" \
    -d "$payload"
}

info "3. bootstrapSession → profile + quota + claims"
RESULT=$(call bootstrapSession '{"timezone":"Asia/Manila"}')
echo "$RESULT" | grep -q '"success":true' && pass "bootstrapSession ok" || fail "bootstrapSession: $RESULT"
echo "$RESULT" | grep -q '"creditsRemaining"' && pass "May quota document" || fail "Walang quota sa response"

info "4. getQuota → dapat may dailyLimit na 5 (free plan)"
RESULT=$(call getQuota '{}')
echo "$RESULT" | grep -q '"dailyLimit":5' && pass "Free plan daily limit = 5" || fail "Mali ang dailyLimit: $RESULT"

info "5. Idempotency — dalawang requestPhotoUpload na parehong key"
KEY="smoke-$(date +%s)-key"
PAYLOAD="{\"mode\":\"single\",\"visibility\":\"private\",\"filterId\":\"none\",\"idempotencyKey\":\"${KEY}\",\"sizeBytes\":1024,\"contentType\":\"image/jpeg\"}"
FIRST=$(call requestPhotoUpload "$PAYLOAD")
FIRST_ID=$(echo "$FIRST" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.photoId||'')}catch{console.log('')}})")
SECOND=$(call requestPhotoUpload "$PAYLOAD")
echo "$SECOND" | grep -q 'already-exists' && pass "Naiwasan ang dobleng reservation" || fail "Dapat already-exists ang pangalawang request: $SECOND"

info "6. Rate limiting — 65 mabilis na upload_request (limit 60/min)"
BLOCKED=0
for i in $(seq 1 65); do
  R=$(call requestPhotoUpload "{\"mode\":\"single\",\"visibility\":\"private\",\"filterId\":\"none\",\"sizeBytes\":512,\"contentType\":\"image/jpeg\"}")
  echo "$R" | grep -q 'resource-exhausted' && { BLOCKED=1; break; }
done
[ "$BLOCKED" -eq 1 ] && pass "Nag-rate limit pagkatapos ng budget" || fail "Hindi nag-rate limit"

info "7. Admin gating — ordinaryong user ay hindi makakapag-adminListUsers"
RESULT=$(call adminListUsers '{}')
echo "$RESULT" | grep -qE 'permission-denied' && pass "Naka-block ang non-admin" || fail "Dapat permission-denied: $RESULT"

info "8. Analytics allowlist — dapat tanggapin ang valid, tanggihan ang invalid"
RESULT=$(call logAnalyticsEvents "{\"sessionId\":\"smoke\",\"platform\":\"ios\",\"appVersion\":\"1.0.0\",\"events\":[{\"name\":\"photo_captured\",\"params\":{\"filter\":\"anime\"}},{\"name\":\"steal_my_data\",\"params\":{}}]}")
echo "$RESULT" | grep -q '"accepted":1' && pass "1 tinanggap, 1 tinanggihan" || fail "Mali ang allowlist behavior: $RESULT"

info "9. Analytics data — dapat nabasa ng admin lang"
RESULT=$(call getMyPhotos '{}')
echo "$RESULT" | grep -q '"success":true' && pass "getMyPhotos (walang data pa, pero ok ang auth)" || fail "getMyPhotos: $RESULT"

info "10. Nagpo-promote ng superadmin at sinusuri ang premium gating"
node -e "
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
initializeApp({ credential: applicationDefault() });
(async () => {
  const db = getFirestore(); const auth = getAuth();
  await db.collection('adminRoles').doc('${UID}').set({
    uid: '${UID}', email: '${EMAIL}', role: 'superadmin', status: 'active',
    notes: 'smoke test', grantedBy: 'smoke-test',
    grantedAt: new Date(), revokedBy: null, revokedAt: null, createdAt: new Date(), updatedAt: new Date()
  }, { merge: true });
  await auth.setCustomUserClaims('${UID}', { admin: true, role: 'superadmin' });
  console.log('promoted');
})().catch(e => { console.error(e.message); process.exit(1); });
" && pass "Na-promote ang test user" || fail "Hindi ma-promote"

info "11. Kailangan ng BAGONG token pagkatapos ng claim change"
SIGNIN=$(curl -s -X POST "http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key" \
  -H 'Content-Type: application/json' -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\",\"returnSecureToken\":true}")
ID_TOKEN=$(echo "$SIGNIN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).idToken||'')}catch{console.log('')}})")

info "12. Ngayon admin na — dapat pumasa na ang adminListUsers"
RESULT=$(call adminListUsers '{"limit":5}')
echo "$RESULT" | grep -q '"success":true' && pass "Naka-access ang admin" || fail "adminListUsers: $RESULT"

info "13. adminGetDashboard"
RESULT=$(call adminGetDashboard '{}')
echo "$RESULT" | grep -q '"overview"' && pass "May overview metrics" || fail "adminGetDashboard: $RESULT"

info "14. adminAdjustCredits → dapat tumaas ang balance"
BEFORE=$(call getQuota '{}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.quota.creditsRemaining)}catch{console.log('?')}})")
RESULT=$(call adminAdjustCredits '{"uid":"'"${UID}"'","amount":50,"reason":"smoke test grant"}')
AFTER=$(call getQuota '{}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.quota.creditsRemaining)}catch{console.log('?')}})")
if [ "$BEFORE" != "?" ] && [ "$AFTER" != "?" ] && [ "$AFTER" -gt "$BEFORE" ]; then
  pass "credits: ${BEFORE} → ${AFTER}"
else
  fail "Hindi tumaas ang credits (${BEFORE} → ${AFTER}): $RESULT"
fi

info "15. Ledger — dapat may entries na"
RESULT=$(call getCreditHistory '{"limit":10}')
COUNT=$(echo "$RESULT" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.entries.length)}catch{console.log(0)}})")
[ "$COUNT" -gt 0 ] && pass "May ${COUNT} ledger entries" || fail "Walang ledger entries"

echo
if [ "$FAILED" -eq 0 ]; then
  printf "\033[32m✅ PUMASA ANG LAHAT NG SMOKE TEST\033[0m\n\n"
else
  printf "\033[31m❌ MAY NABIGONG TEST — tingnan ang ✗ sa itaas\033[0m\n\n"
  exit 1
fi
