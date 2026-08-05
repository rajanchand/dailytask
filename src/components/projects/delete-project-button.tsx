"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteProjectAction } from "@/server/actions/projects";
import { cn } from "@/lib/utils";

type Props = {
  projectId: string;
  projectName: string;
  className?: string;
  variant?: "ghost" | "outline" | "destructive";
  size?: "sm" | "icon" | "default";
  label?: string;
  /** When true, navigate to /projects after delete (detail page). */
  redirectToList?: boolean;
};

export function DeleteProjectButton({
  projectId,
  projectName,
  className,
  variant = "ghost",
  size = "icon",
  label,
  redirectToList,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `Delete project "${projectName}"? It will be archived and hidden from the list.`,
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await deleteProjectAction(projectId);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Project deleted");
        if (redirectToList) router.push("/projects");
        else router.refresh();
      }
    });
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      className={cn(
        variant === "ghost" && "text-muted-foreground hover:text-destructive",
        className,
      )}
      onClick={handleDelete}
      aria-label={`Delete ${projectName}`}
      title="Delete project"
    >
      <Trash2 className="h-4 w-4" />
      {label ? <span>{pending ? "Deleting…" : label}</span> : null}
    </Button>
  );
}
