import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/layout/nav";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Load brand name for enterprise tenants
  let brandName: string | undefined;
  if (session.user.tenantId) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: { plan: true, extra: true },
    });
    if (tenant?.plan === "enterprise") {
      const extra = tenant.extra as Record<string, unknown> | null;
      if (extra?.brandName) brandName = extra.brandName as string;
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {session.user.isImpersonating && (
        <ImpersonationBanner email={session.user.email} />
      )}
      <Nav userRole={session.user.role} brandName={brandName} />
      <main className="md:ml-56 flex-1 flex flex-col overflow-hidden min-h-0">{children}</main>
    </div>
  );
}
