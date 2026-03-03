import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Zap, Building2 } from "lucide-react";
import { LogoutButton } from "@/components/superadmin/logout-button";

export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "SUPERADMIN") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-card flex flex-col">
        <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="font-semibold text-sm">Agent Bizi</span>
          <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-wider">Platform</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <Link
            href="/superadmin"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Tenants
          </Link>
        </nav>
        <div className="p-3 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <span className="truncate">{session.user.email}</span>
          <LogoutButton />
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
