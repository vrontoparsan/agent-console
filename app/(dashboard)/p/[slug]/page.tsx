import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { CustomPageClient } from "./client";

export default async function CustomPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const page = await prisma.customPage.findUnique({
    where: { slug },
  });

  if (!page) notFound();

  return (
    <CustomPageClient
      slug={page.slug}
      title={page.title}
      config={page.config as Record<string, unknown>}
    />
  );
}
