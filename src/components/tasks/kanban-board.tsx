"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { GripVertical } from "lucide-react";
import { KANBAN_COLUMNS, STATUS_LABELS, cn } from "@/lib/utils";
import {
  updateTaskStatusAction,
  updateTaskProgressAction,
  assignTaskAction,
} from "@/server/actions/tasks";
import { PriorityBadge } from "@/components/tasks/priority-badge";
import { Progress } from "@/components/ui/progress";
import type { TaskStatus } from "@/server/db/schema";

type Task = {
  id: string;
  title: string;
  priority: string;
  status: string;
  progress?: number | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  dueTime?: string | null;
};

type UserOption = { id: string; name: string };

const columnId = (status: string) => `col:${status}`;
const isColumnId = (id: string) => id.startsWith("col:");
const statusFromColumnId = (id: string) => id.replace("col:", "") as TaskStatus;

const collisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length) return pointerHits;
  const rectHits = rectIntersection(args);
  if (rectHits.length) return rectHits;
  return closestCorners(args);
};

function KanbanCard({
  task,
  users,
}: {
  task: Task;
  users: UserOption[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", status: task.status },
  });

  function onProgress(value: number) {
    startTransition(async () => {
      const result = await updateTaskProgressAction(task.id, value);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  function onAssign(assigneeId: string) {
    startTransition(async () => {
      const result = await assignTaskAction(task.id, assigneeId || null);
      if (result?.error) toast.error(result.error);
      else {
        toast.success("Assignee updated");
        router.refresh();
      }
    });
  }

  function onStatus(status: string) {
    startTransition(async () => {
      const result = await updateTaskStatusAction(task.id, status as TaskStatus);
      if (result?.error) toast.error(result.error);
      else router.refresh();
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border border-border bg-card p-3 shadow-sm",
        isDragging && "opacity-40",
        (task.priority === "high" || task.priority === "critical") && "priority-high",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-label="Drag task"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium leading-snug">{task.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            {task.dueTime && (
              <span className="text-[11px] text-muted-foreground">Due {task.dueTime}</span>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Progress</span>
              <span>{task.progress ?? 0}%</span>
            </div>
            <Progress value={task.progress ?? 0} />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              defaultValue={task.progress ?? 0}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onMouseUp={(e) => onProgress(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => onProgress(Number((e.target as HTMLInputElement).value))}
              className="w-full accent-[var(--primary)]"
              aria-label="Update progress"
            />
          </div>
          <select
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={task.status}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onStatus(e.target.value)}
            aria-label="Change status"
          >
            {KANBAN_COLUMNS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
            value={task.assigneeId ?? ""}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onAssign(e.target.value)}
            aria-label="Assign user"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function Column({
  status,
  tasks,
  users,
}: {
  status: string;
  tasks: Task[];
  users: UserOption[];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId(status),
    data: { type: "column", status },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-80 shrink-0 flex-col rounded-2xl border border-border/80 bg-card/60",
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{STATUS_LABELS[status] ?? status}</h3>
          <p className="text-xs text-muted-foreground">{tasks.length} tasks</p>
        </div>
      </div>
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[280px] flex-1 flex-col gap-2 p-3">
          {tasks.map((task) => (
            <KanbanCard key={task.id} task={task} users={users} />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export function KanbanBoard({
  initialTasks,
  users,
}: {
  initialTasks: Task[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(
    () =>
      KANBAN_COLUMNS.map((status) => ({
        status,
        tasks: tasks.filter((t) => t.status === status),
      })),
    [tasks],
  );

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const overId = String(over.id);
    let newStatus: TaskStatus | null = null;

    if (isColumnId(overId)) {
      newStatus = statusFromColumnId(overId);
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) newStatus = overTask.status as TaskStatus;
      else if (over.data.current?.status) newStatus = over.data.current.status as TaskStatus;
    }

    if (!newStatus || newStatus === task.status) return;

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: newStatus!,
              progress: newStatus === "completed" ? 100 : t.progress,
            }
          : t,
      ),
    );

    startTransition(async () => {
      const result = await updateTaskStatusAction(taskId, newStatus!);
      if (result?.error) {
        toast.error(result.error);
        setTasks(initialTasks);
      } else {
        toast.success(`Moved to ${STATUS_LABELS[newStatus!]}`);
        router.refresh();
      }
    });
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Drag cards between columns, or use status / progress / assignee controls on each card.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map(({ status, tasks: colTasks }) => (
            <Column key={status} status={status} tasks={colTasks} users={users} />
          ))}
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="w-72 rounded-xl border border-border bg-card p-3 shadow-xl">
              <p className="text-sm font-medium">{activeTask.title}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
