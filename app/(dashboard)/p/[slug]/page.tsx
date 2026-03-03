import { auth } from "@/lib/auth";
import { tenantPrisma } from "@/lib/prisma-tenant";
import { notFound, redirect } from "next/navigation";
import { CustomPageClient } from "./client";

export default async function CustomPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user?.tenantId) redirect("/login");

  const db = tenantPrisma(session.user.tenantId);
  const page = await db.customPage.findFirst({ where: { slug } });

  if (!page) notFound();

  return (
    <CustomPageClient
      slug={page.slug}
      pageId={page.id}
      title={page.title}
      config={page.config as Record<string, unknown>}
      code={page.code}
      userRole={session?.user?.role}
    />
  );
}
