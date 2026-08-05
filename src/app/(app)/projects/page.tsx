import Link from "next/link";
import { getProjectStats } from "@/server/actions/projects";
import { CreateProjectForm } from "@/components/projects/create-project-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
        {stats.length === 0 ? (
          <p className="col-span-full py-8 text-center text-muted-foreground">No projects yet.</p>
        ) : (
          stats.map(({ project, total, completed, progress }) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="block">
              <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardHeader className="flex flex-row items-center gap-3">
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                    {project.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      {completed}/{total} tasks done
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
