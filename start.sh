#!/bin/sh
echo "=== Agent Console Starting ==="

# Create backup and uploads directories
mkdir -p /data/backups /data/uploads
echo "Data directories ready: /data/backups, /data/uploads"

# Run Prisma migrations
echo "Running database push..."
npx prisma db push --skip-generate 2>&1 || echo "DB push failed (may already be up to date)"

# Seed database (idempotent - skips if already seeded)
echo "Running seed..."
node seed.js 2>&1 || echo "Seed skipped or failed"

# Start Next.js
echo "Starting Next.js server..."
exec node server.js
