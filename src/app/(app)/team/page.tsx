import { getTeamMembers } from "@/server/actions/team";
import {
  updateMemberRoleAction,
  setMemberDisabledAction,
  removeMemberAction,
} from "@/server/actions/auth";
import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROLE_LABELS } from "@/lib/utils";
import { TeamMemberActions } from "@/components/team/team-member-actions";
import { InviteMemberForm } from "@/components/team/invite-member-form";

export default async function TeamPage() {
  const session = await auth();
  const { team, members } = await getTeamMembers();
  const canManage = session?.user && hasPermission(session.user.role as Role, "users.manage");

  return (
    <div className="space-y-6 animate-fade-up">
      {canManage && <InviteMemberForm />}

      <Card>
        <CardHeader>
          <CardTitle>{team?.name ?? "Team"} Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {members.map((member) => {
              const initials = member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{member.name}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline">{ROLE_LABELS[member.role] ?? member.role}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {member.taskStats.completed}/{member.taskStats.total} tasks
                      {member.taskStats.overdue > 0 && (
                        <span className="text-destructive ml-1">· {member.taskStats.overdue} overdue</span>
                      )}
                    </span>
                    {member.disabled && <Badge variant="danger">Disabled</Badge>}
                    {canManage && member.id !== session?.user?.id && (
                      <TeamMemberActions
                        userId={member.id}
                        role={member.role}
                        disabled={member.disabled}
                        updateRole={updateMemberRoleAction}
                        setDisabled={setMemberDisabledAction}
                        remove={removeMemberAction}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
