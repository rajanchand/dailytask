"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { projects, tasks } from "@/server/db/schema";
import { newId } from "@/lib/utils";
import { requireSession, requireUserPermission } from "@/server/session";
import { logActivity } from "@/server/services/activity";

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  teamId: z.string().optional().nullable(),
});

export async function getProjectById(projectId: string) {
  await requireSession();
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.archived, false)))
    .limit(1);
  return project ?? null;
}

export async function getProjectStats() {
  await requireSession();
  const allProjects = await getProjects();
  const stats = await Promise.all(
    allProjects.map(async (project) => {
      const [row] = await db
        .select({
          total: count(),
          completed: sql<number>`count(*) filter (where ${tasks.status} = 'completed')`,
        })
        .from(tasks)
        .where(eq(tasks.projectId, project.id));
      const total = Number(row?.total ?? 0);
      const completed = Number(row?.completed ?? 0);
      return {
        project,
        total,
        completed,
        progress: total ? Math.round((completed / total) * 100) : 0,
      };
    }),
  );
  return stats;
}

export async function createProjectAction(formData: FormData) {
  const session = await requireUserPermission("projects.manage");
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    color: formData.get("color") || "#0d9488",
    teamId: formData.get("teamId") || null,
  });
  if (!parsed.success) return { error: "Invalid project data" };

  const id = newId();
  await db.insert(projects).values({
    id,
    name: parsed.data.name,
    description: parsed.data.description,
    color: parsed.data.color ?? "#0d9488",
    teamId: parsed.data.teamId,
    ownerId: session.user.id,
  });

  await logActivity({
    userId: session.user.id,
    action: "project.created",
    entityType: "project",
    entityId: id,
    details: { name: parsed.data.name },
  });

  revalidatePath("/projects");
  return { ok: true, id };
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  const session = await requireUserPermission("projects.manage");
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    color: formData.get("color") || "#0d9488",
    teamId: formData.get("teamId") || null,
  });
  if (!parsed.success) return { error: "Invalid project data" };

  await db
    .update(projects)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color ?? "#0d9488",
      teamId: parsed.data.teamId,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId));

  await logActivity({
    userId: session.user.id,
    action: "project.updated",
    entityType: "project",
    entityId: projectId,
    details: { name: parsed.data.name },
  });

  revalidatePath("/projects");
  return { ok: true };
}

export async function deleteProjectAction(projectId: string) {
  const session = await requireUserPermission("projects.manage");
  await db
    .update(projects)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await logActivity({
    userId: session.user.id,
    action: "project.archived",
    entityType: "project",
    entityId: projectId,
  });

  revalidatePath("/projects");
  return { ok: true };
}
