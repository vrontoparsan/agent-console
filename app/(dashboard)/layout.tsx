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
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
}
