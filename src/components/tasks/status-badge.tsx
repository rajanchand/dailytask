import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  working_on_it: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  waiting: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  review: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", statusColors[status])}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
