"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";
import {
  Inbox,
  Table2,
  MessageSquare,
  Settings,
  LogOut,
  Zap,
  Menu,
  X,
  Sun,
  Moon,
  LayoutDashboard,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { href: "/events", label: "Events", icon: Inbox },
  { href: "/data", label: "Data", icon: Table2, roles: ["ADMIN"] },
  { href: "/chat", label: "Chat", icon: MessageSquare },
];

type CustomPageNav = {
  slug: string;
  title: string;
  icon: string | null;
  categoryId?: string | null;
  category?: { id: string; name: string } | null;
};

function NavPages({
  pages,
  pathname,
  onNavigate,
}: {
  pages: CustomPageNav[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem("nav-collapsed") || "{}");
    } catch { return {}; }
  });

  function toggleCategory(catId: string) {
    setCollapsed((prev) => {
      const next = { ...prev, [catId]: !prev[catId] };
      try { localStorage.setItem("nav-collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Group pages by category
  const uncategorized = pages.filter((p) => !p.categoryId);
  const categoryMap = new Map<string, { name: string; pages: CustomPageNav[] }>();
  for (const page of pages) {
    if (page.categoryId && page.category) {
      const existing = categoryMap.get(page.categoryId);
      if (existing) {
        existing.pages.push(page);
      } else {
        categoryMap.set(page.categoryId, { name: page.category.name, pages: [page] });
      }
    }
  }

  return (
    <>
      <div className="pt-3 pb-1 px-3">
        <span className="text-xs font-medium text-muted-foreground/50 uppercase tracking-wider">
          Pages
        </span>
      </div>
      {/* Uncategorized pages */}
      {uncategorized.map((page) => {
        const isActive = pathname === `/p/${page.slug}`;
        return (
          <Link
            key={page.slug}
            href={`/p/${page.slug}`}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <LayoutDashboard className="h-4 w-4" />
            {page.title}
          </Link>
        );
      })}
      {/* Category groups */}
      {Array.from(categoryMap.entries()).map(([catId, cat]) => {
        const isCollapsed = !!collapsed[catId];
        const hasActivePage = cat.pages.some((p) => pathname === `/p/${p.slug}`);
        return (
          <div key={catId}>
            <button
              onClick={() => toggleCategory(catId)}
              className={cn(
                "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors cursor-pointer",
                hasActivePage
                  ? "text-primary"
                  : "text-muted-foreground/70 hover:text-muted-foreground"
              )}
            >
              {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {cat.name}
            </button>
            {!isCollapsed && cat.pages.map((page) => {
              const isActive = pathname === `/p/${page.slug}`;
              return (
                <Link
                  key={page.slug}
                  href={`/p/${page.slug}`}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 rounded-lg pl-7 pr-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  {page.title}
                </Link>
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function NavContent({
  onNavigate,
  userRole,
  customPages,
  brandName,
}: {
  onNavigate?: () => void;
  userRole?: string;
  customPages: CustomPageNav[];
  brandName?: string;
}) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  const visibleNavItems = navItems.filter(
    (item) => !item.roles || (userRole && item.roles.includes(userRole))
  );

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <Link
        href="/events"
        className="flex items-center gap-2.5 px-4 py-5"
        onClick={onNavigate}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Zap className="h-4 w-4 text-primary" />
        </div>
        <span className="font-semibold text-sm tracking-tight">
          {brandName || "Agent Bizi"}
        </span>
      </Link>

      {/* Main nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {/* Custom pages with categories */}
        {customPages.length > 0 && (
          <NavPages pages={customPages} pathname={pathname} onNavigate={onNavigate} />
        )}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 pb-4 space-y-1">
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer w-full"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        {/* Settings — ADMIN only */}
        {userRole === "ADMIN" && (
          <Link
            href="/settings"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              pathname.startsWith("/settings")
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        )}

        {/* Logout */}
        <button
          onClick={() =>
            fetch("/api/auth/signout", { method: "POST" }).then(
              () => (window.location.href = "/login")
            )
          }
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer w-full"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
}

export function Nav({ userRole, brandName }: { userRole?: string; brandName?: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [customPages, setCustomPages] = useState<CustomPageNav[]>([]);

  useEffect(() => {
    fetch("/api/pages")
      .then((res) => (res.ok ? res.json() : []))
      .then(setCustomPages)
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-56 flex-col border-r border-sidebar-border bg-sidebar">
        <NavContent userRole={userRole} customPages={customPages} brandName={brandName} />
      </aside>

      {/* Mobile header bar */}
      <header className="md:hidden sticky top-0 z-40 flex items-center h-14 px-4 border-b border-border bg-background/80 backdrop-blur-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/events" className="flex items-center gap-2 ml-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-sm tracking-tight">
            {brandName || "Agent Bizi"}
          </span>
        </Link>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-sidebar border-r border-sidebar-border shadow-xl">
            <div className="absolute top-4 right-3">
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavContent
              onNavigate={() => setMobileOpen(false)}
              userRole={userRole}
              customPages={customPages}
              brandName={brandName}
            />
          </aside>
        </div>
      )}
    </>
  );
}
