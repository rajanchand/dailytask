"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { createProjectAction } from "@/server/actions/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
];

export function CreateProjectForm() {
  const [color, setColor] = useState("#0d9488");
  const [, action, pending] = useActionState(async (_prev: unknown, formData: FormData) => {
    formData.set("color", color);
    const result = await createProjectAction(formData);
    if (result?.error) toast.error(result.error);
    else toast.success("Project created");
  }, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Project</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="Project name" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-14 cursor-pointer p-1"
              />
              <span
                className="h-8 w-8 rounded-full border shadow-sm"
                style={{ backgroundColor: color }}
                aria-hidden
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  title={preset}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition",
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
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} placeholder="Optional description" />
          </div>
          <Button type="submit" className="sm:col-span-2 w-fit" disabled={pending}>
            {pending ? "Creating…" : "Create Project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
