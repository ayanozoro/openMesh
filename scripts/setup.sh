#!/bin/bash
set -e

echo "🚀 Setting up OpenMesh..."

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "Installing pnpm..."
    npm install -g pnpm
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build shared packages (types, utilities)
echo "🏗️  Building shared packages..."
pnpm --filter shared build
pnpm --filter encryption build
pnpm --filter networking build

# Setup environment files
echo "⚙️  Setting up environment files..."
if [ ! -f apps/server/.env.local ]; then
    cp apps/server/.env.example apps/server/.env.local
    echo "✅ Created apps/server/.env.local"
fi

if [ ! -f apps/web/.env.local ]; then
    cp apps/web/.env.example apps/web/.env.local
    echo "✅ Created apps/web/.env.local"
fi

# Start Docker services
echo "🐳 Starting Docker services (MongoDB, Redis)..."
docker-compose up -d

# Wait for services
sleep 3

echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env.local files with your values"
echo "2. Run: pnpm dev"
echo ""