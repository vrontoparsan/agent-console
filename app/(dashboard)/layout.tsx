import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Nav } from "@/components/layout/nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Nav userRole={session.user.role} />
      <main className="md:ml-56 flex-1 flex flex-col overflow-hidden min-h-0">{children}</main>
    </div>
  );
}
