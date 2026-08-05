import { formatDistanceToNow } from "date-fns";
import { auth } from "@/server/auth";
import { isSuperAdmin } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { AccessDenied } from "@/components/access-denied";
import { getSystemHealthAction } from "@/server/actions/system-health";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/utils";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return <Badge variant={ok ? "success" : "danger"}>{label}</Badge>;
}

function MetaGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-muted/60 px-3 py-2.5">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {item.label}
          </dt>
          <dd className="mt-0.5 break-all text-sm font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default async function SystemHealthPage() {
  const session = await auth();
  if (!session?.user || !isSuperAdmin(session.user.role as Role)) {
    return <AccessDenied title="Super Admin access required" />;
  }

  const health = await getSystemHealthAction();
  if ("error" in health) {
    return <AccessDenied title={health.error} />;
  }

  const counts = [
    { label: "Users", value: String(health.database.counts.users) },
    { label: "Teams", value: String(health.database.counts.teams) },
    { label: "Tasks", value: String(health.database.counts.tasks) },
    { label: "Projects", value: String(health.database.counts.projects) },
    { label: "Notifications", value: String(health.database.counts.notifications) },
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">System Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Super Admin diagnostics — no secrets or credentials are shown.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Application</CardTitle>
              <CardDescription>Runtime status and public config</CardDescription>
            </div>
            <StatusPill
              ok={health.app.status === "ok"}
              label={health.app.status === "ok" ? "Healthy" : "Degraded"}
            />
          </CardHeader>
          <CardContent>
            <MetaGrid
              items={[
                { label: "App", value: health.app.name },
                { label: "Version", value: health.app.version },
                { label: "Collected", value: health.app.timestamp },
                { label: "AUTH_URL", value: health.app.authUrl ?? "—" },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Database</CardTitle>
              <CardDescription>Postgres connectivity and row counts</CardDescription>
            </div>
            <StatusPill ok={health.database.ok} label={health.database.ok ? "Connected" : "Down"} />
          </CardHeader>
          <CardContent className="space-y-4">
            <MetaGrid
              items={[
                {
                  label: "Latency",
                  value:
                    health.database.latencyMs != null ? `${health.database.latencyMs} ms` : "—",
                },
                { label: "Error", value: health.database.error ?? "None" },
              ]}
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {counts.map((c) => (
                <div key={c.label} className="rounded-lg border border-border px-3 py-2 text-center">
                  <div className="text-lg font-semibold tabular-nums">{c.value}</div>
                  <div className="text-[11px] text-muted-foreground">{c.label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Redis</CardTitle>
              <CardDescription>Rate limits and job queue backend</CardDescription>
            </div>
            <StatusPill ok={health.redis.ok} label={health.redis.ok ? "PONG" : "Unavailable"} />
          </CardHeader>
          <CardContent>
            <MetaGrid
              items={[
                {
                  label: "Latency",
                  value: health.redis.latencyMs != null ? `${health.redis.latencyMs} ms` : "—",
                },
                { label: "Status", value: health.redis.message },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Host</CardTitle>
            <CardDescription>Container / process memory, disk, and uptime</CardDescription>
          </CardHeader>
          <CardContent>
            <MetaGrid
              items={[
                { label: "Hostname", value: health.host.hostname },
                { label: "Uptime", value: formatUptime(health.host.uptimeSec) },
                { label: "Load avg", value: health.host.loadAvg.join(" / ") },
                { label: "Memory used", value: health.host.memory.used },
                { label: "Memory total", value: health.host.memory.total },
                { label: "Memory free", value: health.host.memory.available },
                {
                  label: "Disk used",
                  value: health.host.disk
                    ? `${health.host.disk.used} / ${health.host.disk.total}`
                    : "—",
                },
                { label: "Node", value: health.host.nodeVersion },
                { label: "Platform", value: health.host.platform },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>Accounts without password hashes or reset tokens</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-left font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {health.users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
                {health.users.map((user) => (
                  <tr key={user.id} className="border-b border-border/60">
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {user.disabled ? (
                        <Badge variant="danger">Disabled</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDistanceToNow(user.createdAt, { addSuffix: true })}
                    </td>
                    <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-muted-foreground">
                      {user.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Latest audit log sample</CardDescription>
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
                {health.activity.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No activity yet.
                    </td>
                  </tr>
                )}
                {health.activity.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDistanceToNow(row.createdAt, { addSuffix: true })}
                    </td>
                    <td className="px-4 py-3">{row.userName ?? "System"}</td>
                    <td className="px-4 py-3 font-medium">{row.action}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.entityType}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">
                      {row.details ? JSON.stringify(row.details) : "—"}
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
