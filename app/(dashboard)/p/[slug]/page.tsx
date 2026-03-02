import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import { CustomPageClient } from "./client";

export default async function CustomPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [page, session] = await Promise.all([
    prisma.customPage.findUnique({ where: { slug } }),
    auth(),
  ]);

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
