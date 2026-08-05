"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  deleteDatabaseUserAction,
  getDatabaseUserDetailAction,
  listDatabaseUserSessionsAction,
  resetDatabaseUserPasswordAction,
  setDatabaseUserDisabledAction,
  updateDatabaseUserAction,
  type DatabaseUserSafe,
} from "@/server/actions/system-health-database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ROLE_LABELS } from "@/lib/utils";
import type { Role } from "@/server/db/schema";

const ALL_ROLES: Role[] = [
  "super_admin",
  "admin",
  "manager",
  "team_leader",
  "member",
  "viewer",
];

type Membership = {
  id: string;
  teamId: string;
  teamName: string;
  role: Role;
  invitedAt: Date;
  joinedAt: Date | null;
};

type SessionRow = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  isp: string | null;
  status: string;
  loginAt: Date;
  lastSeenAt: Date | null;
  logoutAt: Date | null;
};

type Telemetry = {
  lastIp: string | null;
  lastIsp: string | null;
  lastBrowser: string | null;
  lastOs: string | null;
  lastDevice: string | null;
  lastCountry: string | null;
  lastOnlineAt: Date | null;
  lastUsedPortalAt: Date | null;
  createdAt: Date;
  sessionCount: number;
};

type Props = {
  users: DatabaseUserSafe[];
  currentUserId: string;
};

function asDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  return d instanceof Date ? d : new Date(d);
}

function formatWhen(d: Date | string | null | undefined) {
  const date = asDate(d);
  if (!date) return "—";
  return `${format(date, "dd MMM yyyy HH:mm")} (${formatDistanceToNow(date, { addSuffix: true })})`;
}

function formatIpIsp(ip: string | null | undefined, isp: string | null | undefined) {
  if (!ip && !isp) return "—";
  if (ip && isp) return `${ip} · ${isp}`;
  return ip ?? isp ?? "—";
}

export function DatabaseUsersConsole({ users: initialUsers, currentUserId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialUsers[0]?.id ?? null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [sessionsHasMore, setSessionsHasMore] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialUsers;
    return initialUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q),
    );
  }, [initialUsers, query]);

  const selected = initialUsers.find((u) => u.id === selectedId) ?? null;

  function loadDetail(userId: string) {
    setSelectedId(userId);
    setDetailLoading(true);
    setDetailError(null);
    setTelemetry(null);
    startTransition(async () => {
      const result = await getDatabaseUserDetailAction(userId);
      setDetailLoading(false);
      if ("error" in result && result.error) {
        setDetailError(result.error);
        setMemberships([]);
        setSessions([]);
        setTelemetry(null);
        setSessionsHasMore(false);
        return;
      }
      if (result.ok) {
        setMemberships(result.memberships as Membership[]);
        setSessions(result.sessions as SessionRow[]);
        setTelemetry(result.telemetry as Telemetry);
        setSessionsHasMore(Boolean(result.sessionsHasMore));
      }
    });
  }

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once for initial selection
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Structured admin console — password hashes and reset tokens are never shown.
            </CardDescription>
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, role, id…"
            className="sm:max-w-xs"
          />
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
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No users match your search.
                    </td>
                  </tr>
                )}
                {filtered.map((user) => {
                  const active = user.id === selectedId;
                  return (
                    <tr
                      key={user.id}
                      className={`cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40 ${
                        active ? "bg-muted/60" : ""
                      }`}
                      onClick={() => loadDetail(user.id)}
                    >
                      <td className="px-4 py-3 font-medium">
                        {user.name}
                        {user.id === currentUserId ? (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{user.email}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{ROLE_LABELS[user.role] ?? user.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user.disabled ? (
                          <Badge variant="danger">Blocked</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatDistanceToNow(asDate(user.createdAt) ?? new Date(), {
                          addSuffix: true,
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <UserDetailPanel
          key={selected.id}
          user={selected}
          currentUserId={currentUserId}
          memberships={memberships}
          sessions={sessions}
          setSessions={setSessions}
          telemetry={telemetry}
          sessionsHasMore={sessionsHasMore}
          setSessionsHasMore={setSessionsHasMore}
          detailLoading={detailLoading || pending}
          detailError={detailError}
          onRefresh={() => {
            router.refresh();
            loadDetail(selected.id);
          }}
          onDeleted={() => {
            setSelectedId(null);
            setMemberships([]);
            setSessions([]);
            setTelemetry(null);
            router.refresh();
          }}
        />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Select a user to view details and manage the account.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TelemetryGrid({
  user,
  telemetry,
  detailLoading,
}: {
  user: DatabaseUserSafe;
  telemetry: Telemetry | null;
  detailLoading: boolean;
}) {
  const created = telemetry?.createdAt ?? user.createdAt;
  const rows: { label: string; value: string }[] = [
    {
      label: "IP / ISP",
      value: formatIpIsp(telemetry?.lastIp, telemetry?.lastIsp),
    },
    { label: "Browser", value: telemetry?.lastBrowser ?? "—" },
    { label: "OS", value: telemetry?.lastOs ?? "—" },
    { label: "Country", value: telemetry?.lastCountry ?? "—" },
    { label: "Last online", value: formatWhen(telemetry?.lastOnlineAt) },
    { label: "Last used portal", value: formatWhen(telemetry?.lastUsedPortalAt) },
    { label: "Created", value: formatWhen(created) },
    {
      label: "Sessions",
      value:
        telemetry?.sessionCount != null ? String(telemetry.sessionCount) : detailLoading ? "…" : "—",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Connection & activity</CardTitle>
        <CardDescription>From latest login session and account timestamps</CardDescription>
      </CardHeader>
      <CardContent>
        {detailLoading && !telemetry ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{r.label}</dt>
                <dd className="mt-0.5 break-words text-sm font-medium">{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function SessionHistoryCard({
  userId,
  sessions,
  setSessions,
  sessionsHasMore,
  setSessionsHasMore,
  detailLoading,
}: {
  userId: string;
  sessions: SessionRow[];
  setSessions: (s: SessionRow[] | ((prev: SessionRow[]) => SessionRow[])) => void;
  sessionsHasMore: boolean;
  setSessionsHasMore: (v: boolean) => void;
  detailLoading: boolean;
}) {
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function loadMore() {
    setLoadingMore(true);
    void (async () => {
      const result = await listDatabaseUserSessionsAction(userId, {
        offset: sessions.length,
        limit: 25,
      });
      setLoadingMore(false);
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      if (result.ok) {
        setSessions((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const next = [...prev];
          for (const s of result.sessions as SessionRow[]) {
            if (!seen.has(s.id)) next.push(s);
          }
          return next;
        });
        setSessionsHasMore(Boolean(result.hasMore));
      }
    })();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">History</CardTitle>
        <CardDescription>
          Login sessions — IP, OS, browser, country, ISP, last seen
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {detailLoading && sessions.length === 0 ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-muted-foreground">No sessions recorded.</p>
        ) : (
          <>
            {sessions.map((s) => {
              const open = expandedId === s.id;
              return (
                <div key={s.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        s.status === "active"
                          ? "success"
                          : s.status === "logged_out"
                            ? "outline"
                            : "warning"
                      }
                    >
                      {s.status}
                    </Badge>
                    <span className="font-mono text-xs">{formatIpIsp(s.ipAddress, s.isp)}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {s.browser ?? "Unknown browser"} · {s.os ?? "Unknown OS"} ·{" "}
                    {s.device ?? "Unknown device"}
                    {s.country ? ` · ${s.country}` : ""}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Login {formatWhen(s.loginAt)}
                    {s.lastSeenAt ? ` · Last seen ${formatWhen(s.lastSeenAt)}` : null}
                    {s.logoutAt ? ` · Logout ${formatWhen(s.logoutAt)}` : null}
                  </div>
                  <div className="mt-1.5">
                    <button
                      type="button"
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => setExpandedId(open ? null : s.id)}
                    >
                      {open ? "Less" : "More"}
                    </button>
                  </div>
                  {open ? (
                    <div className="mt-2 space-y-1 rounded-md bg-muted/40 px-2 py-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">IP: </span>
                        {s.ipAddress ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">ISP: </span>
                        {s.isp ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Country: </span>
                        {s.country ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Browser: </span>
                        {s.browser ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">OS: </span>
                        {s.os ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Device: </span>
                        {s.device ?? "—"}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">User-Agent: </span>
                        <span className="break-all">{s.userAgent ?? "—"}</span>
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Session id: </span>
                        <span className="font-mono">{s.id}</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {sessionsHasMore ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? "Loading…" : "Load more history"}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UserDetailPanel({
  user,
  currentUserId,
  memberships,
  sessions,
  setSessions,
  telemetry,
  sessionsHasMore,
  setSessionsHasMore,
  detailLoading,
  detailError,
  onRefresh,
  onDeleted,
}: {
  user: DatabaseUserSafe;
  currentUserId: string;
  memberships: Membership[];
  sessions: SessionRow[];
  setSessions: (s: SessionRow[] | ((prev: SessionRow[]) => SessionRow[])) => void;
  telemetry: Telemetry | null;
  sessionsHasMore: boolean;
  setSessionsHasMore: (v: boolean) => void;
  detailLoading: boolean;
  detailError: string | null;
  onRefresh: () => void;
  onDeleted: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isSelf = user.id === currentUserId;

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<Role>(user.role);
  const [timezone, setTimezone] = useState(user.timezone);
  const [address, setAddress] = useState(user.address ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [contactNumber, setContactNumber] = useState(user.contactNumber ?? "");
  const [disabled, setDisabled] = useState(user.disabled);
  const [mustChangePassword, setMustChangePassword] = useState(user.mustChangePassword);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-3">
        <Card>
          <CardHeader>
            <CardTitle>Edit user</CardTitle>
            <CardDescription className="font-mono text-xs">{user.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="db-name">Name</Label>
                <Input id="db-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="db-email">Email</Label>
                <Input
                  id="db-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="db-role">Role</Label>
                <select
                  id="db-role"
                  className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="db-tz">Timezone</Label>
                <Input
                  id="db-tz"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="db-phone">Phone</Label>
                <Input id="db-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="db-contact">Contact number</Label>
                <Input
                  id="db-contact"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="db-address">Address</Label>
                <Input
                  id="db-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label>Created</Label>
                <p className="text-sm text-muted-foreground">{formatWhen(user.createdAt)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={disabled}
                  disabled={isSelf}
                  onChange={(e) => setDisabled(e.target.checked)}
                />
                Blocked (disabled)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mustChangePassword}
                  onChange={(e) => setMustChangePassword(e.target.checked)}
                />
                Must change password on next login
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await updateDatabaseUserAction({
                      userId: user.id,
                      name,
                      email,
                      role,
                      timezone,
                      address,
                      phone,
                      contactNumber,
                      disabled,
                      mustChangePassword,
                    });
                    if (result.error) toast.error(result.error);
                    else {
                      toast.success(result.message ?? "Saved");
                      onRefresh();
                    }
                  })
                }
              >
                Save changes
              </Button>
              <Button
                variant="outline"
                disabled={pending || (isSelf && !user.disabled)}
                onClick={() =>
                  startTransition(async () => {
                    const next = !user.disabled;
                    if (isSelf && next) {
                      toast.error("You cannot block your own account");
                      return;
                    }
                    const result = await setDatabaseUserDisabledAction(user.id, next);
                    if (result.error) toast.error(result.error);
                    else {
                      toast.success(result.message);
                      setDisabled(next);
                      onRefresh();
                    }
                  })
                }
              >
                {user.disabled ? "Unblock" : "Block"}
              </Button>
              <Button
                variant="secondary"
                disabled={pending || user.disabled}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Send a password reset email to ${user.email}? They will receive a link valid for 1 hour.`,
                    )
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    const result = await resetDatabaseUserPasswordAction(user.id);
                    if (result.error) toast.error(result.error);
                    else {
                      toast.success(result.message);
                      if ("resetUrl" in result && result.resetUrl) {
                        toast.message(`Dev reset link: ${result.resetUrl}`);
                      }
                    }
                  });
                }}
              >
                Reset password
              </Button>
              <Button
                variant="destructive"
                disabled={pending || isSelf}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Permanently delete ${user.name} (${user.email})?\n\nThis cannot be undone. Related ownership will be reassigned to you where required.`,
                    )
                  ) {
                    return;
                  }
                  if (
                    !window.confirm("Type confirmation: really delete this user from the database?")
                  ) {
                    return;
                  }
                  startTransition(async () => {
                    const result = await deleteDatabaseUserAction(user.id);
                    if (result.error) toast.error(result.error);
                    else {
                      toast.success(result.message);
                      onDeleted();
                    }
                  });
                }}
              >
                Delete user
              </Button>
            </div>
          </CardContent>
        </Card>

        <TelemetryGrid user={user} telemetry={telemetry} detailLoading={detailLoading} />
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team membership</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {detailError ? (
              <p className="text-destructive">{detailError}</p>
            ) : detailLoading && memberships.length === 0 ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : memberships.length === 0 ? (
              <p className="text-muted-foreground">No team memberships.</p>
            ) : (
              memberships.map((m) => (
                <div key={m.id} className="rounded-lg border border-border px-3 py-2">
                  <div className="font-medium">{m.teamName}</div>
                  <div className="text-xs text-muted-foreground">
                    {ROLE_LABELS[m.role] ?? m.role}
                    {m.joinedAt
                      ? ` · joined ${formatDistanceToNow(asDate(m.joinedAt) ?? new Date(), {
                          addSuffix: true,
                        })}`
                      : " · invited"}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <SessionHistoryCard
          userId={user.id}
          sessions={sessions}
          setSessions={setSessions}
          sessionsHasMore={sessionsHasMore}
          setSessionsHasMore={setSessionsHasMore}
          detailLoading={detailLoading}
        />
      </div>
    </div>
  );
}
