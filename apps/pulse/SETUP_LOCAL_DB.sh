#!/bin/bash
# Setup Local PostgreSQL Database for Development
# Fixes IPv6 connectivity issues with Supabase

set -e

echo "🐘 Setting Up Local PostgreSQL Database"
echo "========================================"
echo ""

# Detect docker-compose command (v1 vs v2)
if command -v docker &> /dev/null; then
  if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
  elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
  else
    echo "❌ Error: Docker Compose not found"
    echo ""
    echo "Please install Docker Desktop:"
    echo "  https://www.docker.com/products/docker-desktop"
    echo ""
    echo "Or install Docker Compose:"
    echo "  brew install docker-compose"
    exit 1
  fi
else
  echo "❌ Error: Docker not found"
  echo ""
  echo "Please install Docker Desktop:"
  echo "  https://www.docker.com/products/docker-desktop"
  exit 1
fi

echo "Using: $DOCKER_COMPOSE"
echo ""

# Step 1: Start PostgreSQL container
echo "1️⃣  Starting PostgreSQL container..."
$DOCKER_COMPOSE up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker exec booth-audio-db pg_isready -U postgres > /dev/null 2>&1; do
  echo "   Waiting for database..."
  sleep 2
done
echo "✅ PostgreSQL is ready!"
echo ""

# Step 2: Run Prisma migrations
echo "2️⃣  Running Prisma migrations..."
npx prisma migrate deploy
echo ""

# Step 3: Seed database with multi-tenant data
echo "3️⃣  Seeding database with sample data..."
npm run db:seed:multi-tenant
echo ""

# Step 4: Verify connection
echo "4️⃣  Verifying database connection..."
npx prisma db execute --stdin <<< "SELECT COUNT(*) as events FROM \"Event\";" || true
echo ""

echo "========================================" 
echo "✅ Local database setup complete!"
echo "========================================" 
echo ""
echo "📋 Database Connection:"
echo "   Host: localhost:5432"
echo "   Database: booth_audio"
echo "   User: postgres"
echo "   Password: postgres"
echo ""
echo "🛠️  Useful Commands:"
echo "   View database: npx prisma studio"
echo "   Stop database: docker-compose down"
echo "   Reset database: docker-compose down -v && ./SETUP_LOCAL_DB.sh"
echo ""
echo "🚀 Start dev server: npm run dev"
echo "   Then test: curl http://localhost:3000/api/health/db"
echo ""
