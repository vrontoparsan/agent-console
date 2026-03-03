import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Check if SUPERADMIN exists
  const existing = await prisma.user.findFirst({
    where: { role: "SUPERADMIN" },
  });
  if (existing) {
    console.log("SUPERADMIN already exists, skipping seed.");
    return;
  }

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

  console.log("Seed completed: SUPERADMIN created");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
