"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { createProjectAction } from "@/server/actions/projects";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CreateProjectForm() {
  const [, action, pending] = useActionState(async (_prev: unknown, formData: FormData) => {
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
            <Input id="color" name="color" type="color" defaultValue="#0d9488" className="h-10 w-20" />
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
