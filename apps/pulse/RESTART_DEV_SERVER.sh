#!/bin/bash
# Hard Restart Dev Server with New DB Configuration
# Run this after updating .env.local

set -e

echo "🔄 Hard Restart: Next.js Dev Server"
echo "===================================="
echo ""

# Step 1: Kill any running Next.js processes
echo "1️⃣  Killing any running Next.js processes..."
pkill -f "next dev" || true
sleep 1

# Step 2: Clear Next.js build cache
echo "2️⃣  Clearing .next build cache..."
rm -rf .next

# Step 3: Verify environment variables
echo "3️⃣  Verifying .env.local configuration..."
echo ""
echo "📋 Current DATABASE_URL:"
grep "^DATABASE_URL=" .env.local | sed 's/:.*@/:***@/g'
echo ""
echo "📋 Current DIRECT_URL:"
grep "^DIRECT_URL=" .env.local | sed 's/:.*@/:***@/g'
echo ""

# Step 4: Start dev server
echo "4️⃣  Starting fresh dev server..."
echo ""
echo "Look for these logs:"
echo "  [Prisma] Creating new PrismaClient instance"
echo "  [Prisma] DATABASE_URL host: aws-1-us-east-2.pooler.supabase.com:5432"
echo "  [Prisma] DIRECT_URL host: aws-1-us-east-2.pooler.supabase.com:5432"
echo ""
echo "Then test: curl http://localhost:3000/api/health/db"
echo ""
echo "========================================" 
echo "🚀 Starting npm run dev..."
echo "========================================" 
echo ""

npm run dev
