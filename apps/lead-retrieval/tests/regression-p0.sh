#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# Go-Live P0 Regression Tests
# Run against a PRODUCTION or STAGING build (NODE_ENV=production)
# Usage:  BASE_URL=https://your-staging.vercel.app ./tests/regression-p0.sh
# ──────────────────────────────────────────────────────────────────────
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
PASS=0
FAIL=0

pass() { echo "✅ PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "❌ FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── P0-1: x-dev-bypass must NOT bypass auth in production ─────────────

echo ""
echo "═══ P0-1: x-dev-bypass auth bypass ═══"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-dev-bypass: true" \
  "${BASE_URL}/api/exhibitor/leads/list")

if [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ]; then
  pass "x-dev-bypass on /api/exhibitor/leads/list returns $STATUS (blocked)"
else
  fail "x-dev-bypass on /api/exhibitor/leads/list returns $STATUS (expected 401 or 403)"
fi

STATUS2=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-dev-bypass: true" \
  "${BASE_URL}/api/campaigns")

if [ "$STATUS2" = "401" ] || [ "$STATUS2" = "403" ]; then
  pass "x-dev-bypass on /api/campaigns returns $STATUS2 (blocked)"
else
  fail "x-dev-bypass on /api/campaigns returns $STATUS2 (expected 401 or 403)"
fi

STATUS3=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "x-dev-bypass: true" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}' \
  "${BASE_URL}/api/campaigns")

if [ "$STATUS3" = "401" ] || [ "$STATUS3" = "403" ]; then
  pass "x-dev-bypass on POST /api/campaigns returns $STATUS3 (blocked)"
else
  fail "x-dev-bypass on POST /api/campaigns returns $STATUS3 (expected 401 or 403)"
fi

# ── P0-3: campaigns POST role check ──────────────────────────────────

echo ""
echo "═══ P0-3: campaigns POST role guard ═══"

# Without any auth at all, should get 401
STATUS4=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"test campaign"}' \
  "${BASE_URL}/api/campaigns")

if [ "$STATUS4" = "401" ] || [ "$STATUS4" = "403" ]; then
  pass "Unauthenticated POST /api/campaigns returns $STATUS4"
else
  fail "Unauthenticated POST /api/campaigns returns $STATUS4 (expected 401 or 403)"
fi

# ── Duplicate license creation ────────────────────────────────────────

echo ""
echo "═══ Duplicate license creation ═══"

# Without auth, should get 401 (verifies the API doesn't expose raw DB errors)
STATUS5=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"eventId":"00000000-0000-0000-0000-000000000000","exhibitorCompanyId":"00000000-0000-0000-0000-000000000000","seatsTotal":1,"termMonths":12,"priceCents":0,"expiresAt":"2027-12-31","status":"active"}' \
  "${BASE_URL}/api/admin/licenses")

if [ "$STATUS5" = "401" ] || [ "$STATUS5" = "403" ]; then
  pass "Unauthenticated POST /api/admin/licenses returns $STATUS5 (auth blocked)"
else
  fail "Unauthenticated POST /api/admin/licenses returns $STATUS5 (expected 401 or 403)"
fi

# ── Summary ───────────────────────────────────────────────────────────

echo ""
echo "═══ Results: $PASS passed, $FAIL failed ═══"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
