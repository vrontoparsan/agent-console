"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
      onClick={() => signOut({ callbackUrl: "/login" })}
      title="Sign out"
    >
      <LogOut className="h-3.5 w-3.5" />
    </Button>
  );
}
