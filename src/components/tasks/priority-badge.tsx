import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS, cn } from "@/lib/utils";

const priorityColors: Record<string, string> = {
  critical: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  none: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const priorityDots: Record<string, string> = {
  critical: "🔴",
  high: "🟥",
  medium: "🟡",
  low: "🟢",
  none: "⚪",
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", priorityColors[priority])}>
      <span aria-hidden>{priorityDots[priority] ?? ""}</span> {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}
