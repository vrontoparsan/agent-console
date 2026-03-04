import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  FileText,
  Tags,
  Clock,
  Users,
  Mail,
  Wand2,
  HardDrive,
} from "lucide-react";

const settingsItems = [
  {
    href: "/settings/company",
    label: "Company Info",
    description: "Name, ICO, DIC, address",
    icon: Building2,
    roles: ["SUPERADMIN", "ADMIN"],
  },
  {
    href: "/settings/contexts",
    label: "Agent Contexts",
    description: "Permanent AI contexts for the agent",
    icon: FileText,
    roles: ["ADMIN"],
  },
  {
    href: "/settings/events",
    label: "Event Configurator",
    description: "Categories and their AI contexts",
    icon: Tags,
    roles: ["SUPERADMIN", "ADMIN"],
  },
  {
    href: "/settings/crons",
    label: "Cron Jobs",
    description: "Scheduled tasks and actions",
    icon: Clock,
    roles: ["SUPERADMIN", "ADMIN"],
  },
  {
    href: "/settings/users",
    label: "User Management",
    description: "Manage users and their roles",
    icon: Users,
    roles: ["SUPERADMIN", "ADMIN"],
  },
  {
    href: "/settings/email",
    label: "Email Settings",
    description: "Email accounts for receiving events",
    icon: Mail,
    roles: ["SUPERADMIN", "ADMIN"],
  },
  {
    href: "/settings/sections",
    label: "Manage Sections",
    description: "Create, manage, and delete custom UI sections",
    icon: Wand2,
    roles: ["SUPERADMIN", "ADMIN"],
  },
  {
    href: "/settings/backup",
    label: "Snapshots",
    description: "Section snapshots with code and database restore",
    icon: HardDrive,
    roles: ["SUPERADMIN", "ADMIN"],
  },
];

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const role = session.user.role;

  // Only ADMIN can access settings
  if (role !== "ADMIN" && role !== "SUPERADMIN") redirect("/events");

  const visibleItems = settingsItems.filter((item) =>
    item.roles.includes(role)
  );

  return (
    <div className="flex-1 overflow-auto max-w-2xl mx-auto py-8 px-6 w-full">
      <h1 className="text-lg font-semibold tracking-tight mb-6">Settings</h1>
      <div className="grid gap-2">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 rounded-xl border border-border p-4 hover:bg-accent/50 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
