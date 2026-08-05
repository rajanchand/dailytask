"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateProjectAction } from "@/server/actions/projects";
import { cn } from "@/lib/utils";

const COLOR_PRESETS = [
  "#0d9488",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#4f46e5",
  "#64748b",
];

export type EditableProject = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
};

type Props = {
  project: EditableProject;
  className?: string;
  variant?: "ghost" | "outline" | "secondary";
  size?: "sm" | "icon" | "default";
  label?: string;
};

export function EditProjectButton({
  project,
  className,
  variant = "ghost",
  size = "icon",
  label,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [color, setColor] = useState(project.color || "#0d9488");

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setColor(project.color || "#0d9488");
  }

  function handleSubmit(formData: FormData) {
    formData.set("color", color);
    startTransition(async () => {
      const result = await updateProjectAction(project.id, formData);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Project updated");
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn(className)}
          aria-label={`Edit ${project.name}`}
          title="Edit project"
          onClick={(e) => e.stopPropagation()}
        >
          <Pencil className="h-4 w-4" />
          {label ? <span>{label}</span> : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`project-name-${project.id}`}>Name</Label>
            <Input
              id={`project-name-${project.id}`}
              name="name"
              required
              defaultValue={project.name}
              placeholder="Project name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`project-color-${project.id}`}>Color</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`project-color-${project.id}`}
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 cursor-pointer p-1"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 max-w-[8rem] font-mono text-sm"
                placeholder="#0d9488"
                aria-label="Color hex"
              />
              <span
                className="h-8 w-8 rounded-full border shadow-sm"
                style={{ backgroundColor: color }}
                aria-hidden
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={preset}
                  className={cn(
                    "h-7 w-7 rounded-full border-2 transition",
                    color.toLowerCase() === preset.toLowerCase()
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: preset }}
                  onClick={() => setColor(preset)}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`project-desc-${project.id}`}>Description</Label>
            <Textarea
              id={`project-desc-${project.id}`}
              name="description"
              rows={2}
              defaultValue={project.description ?? ""}
              placeholder="Optional description"
            />
          </div>
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
