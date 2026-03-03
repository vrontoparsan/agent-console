"use client";

import { Shield } from "lucide-react";

export function ImpersonationBanner({ email }: { email: string }) {
  async function handleExit() {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/superadmin";
  }

  return (
    <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-amber-400">
        <Shield className="h-4 w-4" />
        <span>
          Viewing as <strong>{email}</strong> (impersonation mode)
        </span>
      </div>
      <button
        onClick={handleExit}
        className="text-amber-400 hover:text-amber-300 underline text-xs font-medium"
      >
        Exit
      </button>
    </div>
  );
}
