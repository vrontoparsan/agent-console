import { ArrowLeft, Mail, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function EmailSettingsPage() {
  const imapHost = process.env.IMAP_HOST || "";
  const imapUser = process.env.IMAP_USER || "";
  const configured = !!imapHost && !!imapUser;

  return (
    <div className="max-w-lg mx-auto py-8 px-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Email Settings</h1>
      </div>

      <div className="rounded-xl border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Connected Email</p>
            <p className="text-xs text-muted-foreground">
              Configured via environment variables
            </p>
          </div>
        </div>

        {configured ? (
          <div className="space-y-3 pt-2">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                IMAP Host
              </p>
              <p className="text-sm font-mono mt-0.5">{imapHost}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                Account
              </p>
              <p className="text-sm font-mono mt-0.5">{imapUser}</p>
            </div>
            <div className="flex items-center gap-2 text-plus text-sm">
              <div className="h-2 w-2 rounded-full bg-plus" />
              Connected
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
            <AlertCircle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-500">
                Not configured
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Set IMAP_HOST, IMAP_PORT, IMAP_USER, and IMAP_PASSWORD
                environment variables to enable email reading.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
