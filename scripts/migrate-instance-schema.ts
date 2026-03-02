// Migration script: Create `instance` PostgreSQL schema and move cstm_ / custom_ tables.
// Usage: npx tsx scripts/migrate-instance-schema.ts
// Idempotent — safe to run multiple times.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Instance Schema Migration ===\n");

  // 1. Create instance schema
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS instance`);
  console.log("1. Schema 'instance' ensured.");

  // 2. Find cstm_*/custom_* tables still in public schema
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
     AND (table_name LIKE 'cstm_%' OR table_name LIKE 'custom_%')
     ORDER BY table_name`
  );

  if (tables.length === 0) {
    console.log("2. No cstm_*/custom_* tables in public schema. Nothing to move.");
  } else {
    console.log(`2. Found ${tables.length} table(s) to move:\n`);
    for (const { table_name } of tables) {
      try {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE public."${table_name}" SET SCHEMA instance`
        );
        console.log(`   - ${table_name} → instance.${table_name}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("already exists")) {
          console.log(`   - ${table_name} — already in instance schema, skipping.`);
        } else {
          console.error(`   - ${table_name} — ERROR: ${msg}`);
        }
      }
    }
  }

  // 3. Verify
  const result = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'instance'
     ORDER BY table_name`
  );
  console.log(`\n3. Tables in 'instance' schema: ${result.length}`);
  for (const { table_name } of result) {
    console.log(`   - instance.${table_name}`);
  }

  console.log("\n=== Migration complete ===");
}

main()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
