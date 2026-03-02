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
    <div className="h-screen overflow-hidden">
      <Nav userRole={session.user.role} />
      <main className="md:ml-56 h-screen flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
