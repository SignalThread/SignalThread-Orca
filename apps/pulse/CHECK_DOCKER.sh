#!/bin/bash
# Check Docker Installation and Status

echo "🐳 Checking Docker Setup"
echo "========================"
echo ""

# Check if Docker is installed
if command -v docker &> /dev/null; then
  echo "✅ Docker CLI installed: $(docker --version)"
else
  echo "❌ Docker CLI not found"
  echo ""
  echo "Install Docker Desktop:"
  echo "  https://www.docker.com/products/docker-desktop"
  echo ""
  echo "Or via Homebrew:"
  echo "  brew install --cask docker"
  exit 1
fi

# Check if Docker daemon is running
if docker info &> /dev/null; then
  echo "✅ Docker daemon is running"
else
  echo "❌ Docker daemon is not running"
  echo ""
  echo "Start Docker Desktop from Applications"
  echo "Or run: open -a Docker"
  exit 1
fi

# Check Docker Compose
if docker compose version &> /dev/null; then
  echo "✅ Docker Compose (v2): $(docker compose version --short)"
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
  echo "✅ Docker Compose (v1): $(docker-compose --version)"
  DOCKER_COMPOSE="docker-compose"
else
  echo "❌ Docker Compose not found"
  echo ""
  echo "Install with: brew install docker-compose"
  exit 1
fi

echo ""
echo "🎉 Docker is ready!"
echo ""
echo "Next steps:"
echo "  ./SETUP_LOCAL_DB.sh    # Setup database"
echo "  $DOCKER_COMPOSE ps     # View running containers"
echo ""
