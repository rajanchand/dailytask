import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { AccessDenied } from "@/components/access-denied";
import { getActivityLogs } from "@/server/actions/activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export default async function ActivityPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "audit.view")) {
    return <AccessDenied title="Activity log access required" />;
  }

  const logs = await getActivityLogs();

  return (
    <div className="animate-fade-up">
      <Card>
        <CardHeader>
          <CardTitle>Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Entity</th>
                  <th className="px-4 py-3 text-left font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No activity yet.
                    </td>
                  </tr>
                )}
                {logs.map(({ log, userName }) => (
                  <tr key={log.id} className="border-b border-border/60">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDistanceToNow(log.createdAt, { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">{userName ?? "System"}</td>
                    <td className="px-4 py-3 font-medium">{log.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">{log.entityType}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                      {log.details ? JSON.stringify(log.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
