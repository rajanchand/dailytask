"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { users, teamMembers, teams, tasks } from "@/server/db/schema";
import { requireSession } from "@/server/session";

export async function getTeamMembers() {
  await requireSession();
  const members = await db
    .select({
      user: users,
      teamRole: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .orderBy(users.name);

  const withStats = await Promise.all(
    members.map(async (m) => {
      const [stats] = await db
        .select({
          total: sql<number>`count(*)`,
          completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')`,
          overdue: sql<number>`count(*) filter (where ${tasks.isOverdue} = true)`,
        })
        .from(tasks)
        .where(eq(tasks.assigneeId, m.user.id));
      return {
        ...m.user,
        teamRole: m.teamRole,
        joinedAt: m.joinedAt,
        taskStats: {
          total: Number(stats?.total ?? 0),
          completed: Number(stats?.completed ?? 0),
          overdue: Number(stats?.overdue ?? 0),
        },
      };
    }),
  );

  const [team] = await db.select().from(teams).limit(1);
  return { team, members: withStats };
}
