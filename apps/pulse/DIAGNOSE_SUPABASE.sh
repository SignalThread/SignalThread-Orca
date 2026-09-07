#!/bin/bash
# Diagnose Supabase Connection Issues

echo "🔍 Supabase Connection Diagnostics"
echo "===================================="
echo ""

# Read connection strings from .env.local
source .env.local 2>/dev/null || true

echo "1️⃣  Checking network connectivity..."
echo ""

# Extract host and port from DATABASE_URL
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

echo "DATABASE_URL host: $DB_HOST"
echo "DATABASE_URL port: $DB_PORT"
echo ""

# Test connection to pooler
echo "Testing connection to $DB_HOST:$DB_PORT..."
if nc -zv -w 5 "$DB_HOST" "$DB_PORT" 2>&1 | grep -q succeeded; then
  echo "✅ Can reach pooler at $DB_HOST:$DB_PORT"
else
  echo "❌ Cannot reach pooler at $DB_HOST:$DB_PORT"
fi
echo ""

# Test DNS resolution
echo "2️⃣  Testing DNS resolution..."
echo ""
echo "Resolving $DB_HOST..."
if host "$DB_HOST" > /dev/null 2>&1; then
  host "$DB_HOST" | head -5
  echo ""
  
  # Check if IPv6 only
  if host "$DB_HOST" | grep -q "has IPv6 address" && ! host "$DB_HOST" | grep -q "has address"; then
    echo "⚠️  WARNING: This host is IPv6-only"
  fi
else
  echo "❌ DNS resolution failed"
fi
echo ""

# Test Prisma CLI
echo "3️⃣  Testing Prisma CLI connection..."
echo ""
echo "Running: npx prisma db execute --stdin <<< 'SELECT 1;'"
if npx prisma db execute --stdin <<< "SELECT 1;" 2>&1 | grep -q "executed successfully"; then
  echo "✅ Prisma CLI connection works"
else
  echo "❌ Prisma CLI connection failed"
fi
echo ""

# Extract direct connection host if exists
DIRECT_HOST=$(echo "$DIRECT_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DIRECT_PORT=$(echo "$DIRECT_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')

if [ -n "$DIRECT_HOST" ] && [ "$DIRECT_HOST" != "$DB_HOST" ]; then
  echo "4️⃣  Checking DIRECT_URL..."
  echo ""
  echo "DIRECT_URL host: $DIRECT_HOST"
  echo "DIRECT_URL port: $DIRECT_PORT"
  echo ""
  
  echo "Testing connection to $DIRECT_HOST:$DIRECT_PORT..."
  if nc -zv -w 5 "$DIRECT_HOST" "$DIRECT_PORT" 2>&1 | grep -q succeeded; then
    echo "✅ Can reach direct host at $DIRECT_HOST:$DIRECT_PORT"
  else
    echo "❌ Cannot reach direct host at $DIRECT_HOST:$DIRECT_PORT"
  fi
  echo ""
fi

# Check if dev server is running
echo "5️⃣  Testing runtime connection (if dev server is running)..."
echo ""
if curl -s http://localhost:3000/api/health/db > /dev/null 2>&1; then
  HEALTH_RESULT=$(curl -s http://localhost:3000/api/health/db)
  echo "Health check response:"
  echo "$HEALTH_RESULT" | jq . 2>/dev/null || echo "$HEALTH_RESULT"
  echo ""
  
  if echo "$HEALTH_RESULT" | grep -q '"ok":true'; then
    echo "✅ Runtime connection works!"
  else
    echo "❌ Runtime connection failed"
    echo ""
    echo "Error details:"
    echo "$HEALTH_RESULT" | jq -r .message 2>/dev/null || echo "Unknown error"
  fi
else
  echo "ℹ️  Dev server not running (start with: npm run dev)"
fi
echo ""

# IPv6 connectivity test
echo "6️⃣  Testing IPv6 connectivity..."
echo ""

# Try to ping6 a known IPv6 host
if ping6 -c 1 google.com > /dev/null 2>&1; then
  echo "✅ IPv6 connectivity available"
else
  echo "❌ No IPv6 connectivity detected"
  echo ""
  echo "⚠️  This is likely the root cause!"
  echo "   Your Supabase database appears to be IPv6-only,"
  echo "   but your network doesn't support IPv6."
fi
echo ""

echo "===================================="
echo "📋 Summary"
echo "===================================="
echo ""
echo "Database Host: $DB_HOST:$DB_PORT"
echo "Direct Host: ${DIRECT_HOST:-same}:${DIRECT_PORT:-same}"
echo ""
echo "Suggested next steps:"
echo "1. Check logs: Look for Prisma errors in terminal"
echo "2. Try different port: Test both 5432 (session) and 6543 (transaction)"
echo "3. Check Supabase dashboard: Verify database is not paused"
echo "4. Test from different network: Try phone hotspot to rule out network issues"
echo ""
