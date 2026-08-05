import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { AccessDenied } from "@/components/access-denied";
import {
  getSystemHealthGateStatus,
  isSystemHealthGateSecretReady,
} from "@/server/system-health-gate";
import { listDatabaseUsersAction } from "@/server/actions/system-health-database";
import { DatabaseUsersConsole } from "@/components/system-health/database-users-console";
import {
  SystemHealthDatabaseChallengeForm,
  SystemHealthLockButton,
} from "@/components/system-health/system-health-gate-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function SystemHealthDatabasePage() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role as Role)) {
    return <AccessDenied title="Super Admin access required" />;
  }

  if (!isSystemHealthGateSecretReady()) {
    redirect("/system-health");
  }

  const gateStatus = await getSystemHealthGateStatus();
  if (!gateStatus.unlocked || gateStatus.locked) {
    redirect("/system-health");
  }

  if (!gateStatus.dbUnlocked) {
    return (
      <div className="space-y-6 animate-fade-up">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Link href="/system-health" className="hover:text-foreground">
                System Health
              </Link>
              <span className="mx-1.5">/</span>
              Database
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight">Database console</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Re-authenticate with System Health credentials before opening the database console.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/system-health">Back to System Health</Link>
            </Button>
            <SystemHealthLockButton />
          </div>
        </div>
        <SystemHealthDatabaseChallengeForm pinAvailable={gateStatus.hasCredentials} />
      </div>
    );
  }

  const listed = await listDatabaseUsersAction();
  if ("error" in listed && listed.error) {
    return <AccessDenied title={listed.error} />;
  }

  const users = listed.ok ? listed.users : [];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Link href="/system-health" className="hover:text-foreground">
              System Health
            </Link>
            <span className="mx-1.5">/</span>
            Database
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Database console</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage users and related records. No arbitrary SQL — structured admin actions only.
            Database access expires after 10 minutes (ops unlock after 30).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/system-health">Back to System Health</Link>
          </Button>
          <SystemHealthLockButton />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm text-muted-foreground">
          <span>
            {users.length} user{users.length === 1 ? "" : "s"} in the database. Password hashes
            are never returned to the browser.
          </span>
        </CardContent>
      </Card>

      <DatabaseUsersConsole users={users} currentUserId={session.user.id} />
    </div>
  );
}
