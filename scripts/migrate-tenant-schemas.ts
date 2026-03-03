// Migration script: Create per-tenant PostgreSQL schemas and migrate from legacy `instance` schema.
// Usage: npx tsx scripts/migrate-tenant-schemas.ts
// Idempotent — safe to run multiple times.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Tenant Schema Migration ===\n");

  // 1. Get all active tenants
  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  if (tenants.length === 0) {
    console.log("No tenants found. Run seed first.");
    return;
  }

  console.log(`Found ${tenants.length} tenant(s).\n`);

  // 2. Check for legacy `instance` schema
  const instanceExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'instance')`
  );
  const hasInstanceSchema = instanceExists[0]?.exists === true;

  // 3. For each tenant, ensure their schema exists
  for (const tenant of tenants) {
    const tenantSchema = `tenant_${tenant.id}`;

    // Check if tenant schema already exists
    const schemaExists = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1)`,
      tenantSchema
    );

    if (schemaExists[0]?.exists) {
      console.log(`[${tenant.name}] Schema "${tenantSchema}" already exists.`);
      continue;
    }

    // If this is the first tenant and legacy `instance` schema exists, rename it
    if (hasInstanceSchema && tenants[0].id === tenant.id) {
      try {
        await prisma.$executeRawUnsafe(`ALTER SCHEMA instance RENAME TO "${tenantSchema}"`);
        console.log(`[${tenant.name}] Renamed "instance" → "${tenantSchema}".`);
        continue;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[${tenant.name}] Could not rename instance schema: ${msg}`);
        // Fallback: create new schema
      }
    }

    // Create new schema
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${tenantSchema}"`);
    console.log(`[${tenant.name}] Created schema "${tenantSchema}".`);
  }

  // 4. Also move any remaining cstm_ tables from public to first tenant's schema
  if (tenants.length > 0) {
    const firstTenantSchema = `tenant_${tenants[0].id}`;
    const publicCstm = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
       AND (table_name LIKE 'cstm_%' OR table_name LIKE 'custom_%')
       ORDER BY table_name`
    );

    if (publicCstm.length > 0) {
      console.log(`\nMoving ${publicCstm.length} public cstm_ table(s) to ${firstTenantSchema}:`);
      for (const { table_name } of publicCstm) {
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE public."${table_name}" SET SCHEMA "${firstTenantSchema}"`
          );
          console.log(`  - ${table_name} → ${firstTenantSchema}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  - ${table_name} — ${msg}`);
        }
      }
    }
  }

  // 5. Verify
  console.log("\n--- Schema Summary ---");
  for (const tenant of tenants) {
    const tenantSchema = `tenant_${tenant.id}`;
    const tables = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = $1`,
      tenantSchema
    );
    console.log(`[${tenant.name}] "${tenantSchema}": ${tables[0]?.count || 0} table(s)`);
  }

  console.log("\n=== Migration complete ===");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
