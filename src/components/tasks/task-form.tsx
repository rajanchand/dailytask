"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS, PRIORITY_LABELS, todayISO, cn } from "@/lib/utils";

type FormOptions = {
  users: { id: string; name: string; email: string }[];
  projects: { id: string; name: string }[];
  categories: { id: string; name: string }[];
};

type TaskFormProps = {
  options: FormOptions;
  defaultValues?: {
    title?: string;
    description?: string;
    notes?: string;
    date?: string;
    startTime?: string;
    dueTime?: string;
    priority?: string;
    status?: string;
    assigneeId?: string;
    projectId?: string;
    categoryId?: string;
    recurrence?: string;
    dailyNotify?: boolean;
    tagNames?: string;
    progress?: number;
  };
  /** When set, project select is locked to this project (e.g. project detail page). */
  lockProjectId?: string;
  submitLabel?: string;
  pending?: boolean;
  onDelete?: () => void;
};

const selectClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function TaskForm({
  options,
  defaultValues = {},
  lockProjectId,
  submitLabel = "Save Task",
  pending,
  onDelete,
}: TaskFormProps) {
  const projectIdDefault = lockProjectId ?? defaultValues.projectId ?? "";

  return (
    <div className="grid gap-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required defaultValue={defaultValues.title} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} defaultValue={defaultValues.description} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={defaultValues.notes} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="date">Date</Label>
          <Input id="date" name="date" type="date" required defaultValue={defaultValues.date ?? todayISO()} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" name="priority" className={selectClass} defaultValue={defaultValues.priority ?? "medium"}>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="startTime">Start Time</Label>
          <Input id="startTime" name="startTime" type="time" defaultValue={defaultValues.startTime} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="dueTime">Due Time</Label>
          <Input id="dueTime" name="dueTime" type="time" defaultValue={defaultValues.dueTime} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" className={selectClass} defaultValue={defaultValues.status ?? "not_started"}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="recurrence">Recurrence</Label>
          <select id="recurrence" name="recurrence" className={selectClass} defaultValue={defaultValues.recurrence ?? "none"}>
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
        <input type="hidden" name="dailyNotify" value="false" />
        <input
          type="checkbox"
          name="dailyNotify"
          value="true"
          defaultChecked={defaultValues.dailyNotify ?? defaultValues.recurrence === "daily"}
          className="mt-0.5 h-4 w-4 rounded border-border"
        />
        <span>
          <span className="font-medium">Daily notify</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Get a morning reminder every day for this task (also applies when Recurrence is Daily).
          </span>
        </span>
      </label>
      <div className="grid gap-2">
        <Label htmlFor="assigneeId">Assign To</Label>
        <select id="assigneeId" name="assigneeId" className={selectClass} defaultValue={defaultValues.assigneeId ?? ""}>
          <option value="">Unassigned</option>
          {options.users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="progress">Progress %</Label>
        <Input
          id="progress"
          name="progress"
          type="number"
          min={0}
          max={100}
          step={5}
          defaultValue={defaultValues.progress ?? 0}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="projectId">Project</Label>
          {lockProjectId ? (
            <>
              <input type="hidden" name="projectId" value={lockProjectId} />
              <Input
                id="projectId"
                readOnly
                value={options.projects.find((p) => p.id === lockProjectId)?.name ?? "This project"}
                className="bg-muted"
              />
            </>
          ) : (
            <select id="projectId" name="projectId" className={selectClass} defaultValue={projectIdDefault}>
              <option value="">None</option>
              {options.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="categoryId">Category</Label>
          <select id="categoryId" name="categoryId" className={selectClass} defaultValue={defaultValues.categoryId ?? ""}>
            <option value="">None</option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="tagNames">Tags (comma-separated)</Label>
        <Input id="tagNames" name="tagNames" placeholder="design, urgent" defaultValue={defaultValues.tagNames} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className={cn("flex-1")}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onDelete && (
          <Button type="button" variant="destructive" disabled={pending} onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
