#!/bin/sh
echo "=== Agent Console Starting ==="
echo "OpenSSL version: $(openssl version 2>&1 || echo 'not found')"

# Run Prisma migrations
echo "Running database push..."
npx prisma db push --skip-generate 2>&1
echo "DB push exit code: $?"

# Seed database (idempotent - skips if already seeded)
echo "Running seed..."
node seed.js 2>&1 || echo "Seed failed (may already be seeded)"

# Start Next.js
echo "Starting Next.js server..."
exec node server.js
