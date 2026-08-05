import { getProjectStats } from "@/server/actions/projects";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { ProjectsGrid } from "@/components/projects/projects-grid";
import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";

export default async function ProjectsPage() {
  const session = await auth();
  const canManage = hasPermission(session!.user.role as Role, "projects.manage");
  const stats = await getProjectStats();

  return (
    <div className="space-y-6 animate-fade-up">
      {canManage && <CreateProjectForm />}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ProjectsGrid stats={stats} canManage={canManage} />
      </div>
    </div>
  );
}
