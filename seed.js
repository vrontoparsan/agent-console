const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // Check if SUPERADMIN already exists
  const superadmin = await prisma.user.findFirst({
    where: { role: "SUPERADMIN" },
  });

  if (superadmin) {
    console.log("SUPERADMIN already exists, checking tenant migration...");
  } else {
    // Create platform SUPERADMIN (no tenantId)
    const password = await hash(process.env.ADMIN_PASSWORD || "admin123", 12);
    await prisma.user.create({
      data: {
        email: "admin@agentbizi.com",
        name: "Platform Admin",
        password,
        role: "SUPERADMIN",
        tenantId: null,
      },
    });
    console.log("Created SUPERADMIN user: admin@agentbizi.com");
  }

  // Migrate existing data to default tenant if needed
  await migrateToDefaultTenant();

  console.log("Seed completed.");
}

async function migrateToDefaultTenant() {
  // Check if there are users without tenantId (excluding SUPERADMIN)
  const orphanUsers = await prisma.user.findMany({
    where: { tenantId: null, role: { not: "SUPERADMIN" } },
    take: 1,
  });

  // Check if there are events without tenantId
  const orphanEvents = await prisma.event.findMany({
    where: { tenantId: null },
    take: 1,
  });

  if (orphanUsers.length === 0 && orphanEvents.length === 0) {
    console.log("No orphan records to migrate.");
    return;
  }

  // Find or create default tenant
  let defaultTenant = await prisma.tenant.findFirst({
    where: { slug: "default" },
  });

  if (!defaultTenant) {
    // Try to get company info from legacy CompanyInfo
    let companyName = "Default Company";
    try {
      const info = await prisma.companyInfo.findUnique({ where: { id: "default" } });
      if (info?.name) companyName = info.name;
    } catch {
      // CompanyInfo may not exist
    }

    defaultTenant = await prisma.tenant.create({
      data: {
        name: companyName,
        slug: "default",
        companyName,
      },
    });
    console.log(`Created default tenant: ${companyName} (${defaultTenant.id})`);
  }

  const tid = defaultTenant.id;

  // Migrate all orphan records to default tenant
  const models = [
    "user",
    "event",
    "eventCategory",
    "emailAccount",
    "eventAction",
    "customPage",
    "sectionCategory",
    "message",
    "agentContext",
    "cronJob",
    "snapshot",
  ];

  for (const model of models) {
    try {
      let where = { tenantId: null };
      if (model === "user") {
        where = { tenantId: null, role: { not: "SUPERADMIN" } };
      }
      const result = await prisma[model].updateMany({
        where,
        data: { tenantId: tid },
      });
      if (result.count > 0) {
        console.log(`  Migrated ${result.count} ${model} record(s) to default tenant`);
      }
    } catch (err) {
      // Model may not have tenantId yet or no records
      console.log(`  Skipped ${model}: ${err.message?.slice(0, 80)}`);
    }
  }

  // Copy CompanyInfo extra to Tenant.extra if not already set
  if (!defaultTenant.extra) {
    try {
      const info = await prisma.companyInfo.findUnique({ where: { id: "default" } });
      if (info) {
        await prisma.tenant.update({
          where: { id: tid },
          data: {
            companyName: info.name || defaultTenant.companyName,
            ico: info.ico || "",
            dic: info.dic || "",
            icDph: info.icDph || "",
            address: info.address || "",
            email: info.email || "",
            phone: info.phone || "",
            web: info.web || "",
            extra: info.extra || undefined,
          },
        });
        console.log("  Copied CompanyInfo fields to default tenant");
      }
    } catch {
      // CompanyInfo may not exist
    }
  }

  console.log(`Migration to default tenant complete (${tid})`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
