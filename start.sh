#!/bin/sh
echo "=== Agent Bizi Starting ==="

# Create data directories
mkdir -p /data/tenants /data/uploads
echo "Data directories ready"

# Run Prisma migrations
echo "Running database push..."
npx prisma db push --skip-generate --accept-data-loss 2>&1 || echo "DB push failed (may already be up to date)"

# Seed database (idempotent — creates SUPERADMIN, migrates legacy data)
echo "Running seed..."
node seed.js 2>&1 || echo "Seed skipped or failed"

# Run tenant schema migration (idempotent — creates per-tenant schemas, renames instance → tenant_*)
echo "Running tenant schema migration..."
npx tsx scripts/migrate-tenant-schemas.ts 2>&1 || echo "Tenant schema migration failed"

# Start Next.js
echo "Starting Next.js server..."
exec node server.js
