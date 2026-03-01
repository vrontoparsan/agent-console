const { PrismaClient } = require("@prisma/client");
const { hash } = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findFirst();
  if (existing) {
    console.log("Database already seeded, skipping.");
    return;
  }

  const password = await hash(process.env.ADMIN_PASSWORD || "admin123", 12);

  await prisma.user.upsert({
    where: { email: "admin@agentconsole.com" },
    update: {},
    create: {
      email: "admin@agentconsole.com",
      name: "Admin",
      password,
      role: "SUPERADMIN",
    },
  });

  await prisma.companyInfo.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  console.log("Seed completed: superadmin user created");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
