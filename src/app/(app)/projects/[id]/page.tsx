import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { getProjectById } from "@/server/actions/projects";
import { getTaskFormOptions, getTasks } from "@/server/actions/tasks";
import { ProjectDetailClient } from "@/components/projects/project-detail-client";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const project = await getProjectById(id);
  if (!project) notFound();

  const [projectTasks, options] = await Promise.all([
    getTasks({ projectId: id }),
    getTaskFormOptions(),
  ]);

  const total = projectTasks.length;
  const completed = projectTasks.filter((t) => t.status === "completed").length;
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return (
    <ProjectDetailClient
      project={project}
      tasks={projectTasks}
      stats={{ total, completed, progress }}
      options={{
        users: options.users,
        projects: options.projects.map((p) => ({ id: p.id, name: p.name })),
        categories: options.categories.map((c) => ({ id: c.id, name: c.name })),
      }}
      access={{
        userId: session!.user.id,
        role: session!.user.role as Role,
        canCreate: hasPermission(session!.user.role as Role, "tasks.create"),
      }}
    />
  );
}
