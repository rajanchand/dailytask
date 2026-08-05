"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EditProjectButton } from "@/components/projects/edit-project-button";
import { DeleteProjectButton } from "@/components/projects/delete-project-button";

type ProjectStat = {
  project: {
    id: string;
    name: string;
    description?: string | null;
    color: string;
  };
  total: number;
  completed: number;
  progress: number;
};

type Props = {
  stats: ProjectStat[];
  canManage: boolean;
};

export function ProjectsGrid({ stats, canManage }: Props) {
  if (stats.length === 0) {
    return <p className="col-span-full py-8 text-center text-muted-foreground">No projects yet.</p>;
  }

  return (
    <>
      {stats.map(({ project, total, completed, progress }) => (
        <Card
          key={project.id}
          className="group relative h-full overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ borderTop: `3px solid ${project.color}` }}
        >
          {canManage && (
            <div
              className="absolute right-2 top-2 z-10 flex gap-0.5 rounded-md bg-background/90 p-0.5 shadow-sm opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <EditProjectButton project={project} />
              <DeleteProjectButton projectId={project.id} projectName={project.name} />
            </div>
          )}
          <Link href={`/projects/${project.id}`} className="block h-full">
            <CardHeader className="flex flex-row items-start gap-3 pr-16">
              <div
                className="mt-1.5 h-4 w-4 shrink-0 rounded-full ring-2 ring-background shadow"
                style={{ backgroundColor: project.color }}
                aria-hidden
              />
              <div className="min-w-0">
                <CardTitle className="leading-snug">{project.name}</CardTitle>
                {project.description ? (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {project.description}
                  </p>
                ) : null}
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
          </Link>
        </Card>
      ))}
    </>
  );
}
