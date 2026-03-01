#!/bin/sh
echo "=== Agent Console Starting ==="

# Run Prisma migrations
echo "Running database push..."
node node_modules/prisma/build/index.js db push --skip-generate 2>&1 || echo "DB push failed (may already be up to date)"

# Start Next.js
echo "Starting Next.js server..."
exec node server.js
