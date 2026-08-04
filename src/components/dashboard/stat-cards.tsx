import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, AlertTriangle, ListTodo, CircleDashed } from "lucide-react";

type StatCardsProps = {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
};

const items = [
  { key: "total" as const, label: "Total Tasks", icon: ListTodo, color: "text-primary" },
  { key: "completed" as const, label: "Completed", icon: CheckCircle2, color: "text-success" },
  { key: "inProgress" as const, label: "In Progress", icon: Clock, color: "text-warning" },
  { key: "pending" as const, label: "Pending", icon: CircleDashed, color: "text-muted-foreground" },
  { key: "overdue" as const, label: "Overdue", icon: AlertTriangle, color: "text-destructive" },
];

export function StatCards({ total, completed, inProgress, pending, overdue }: StatCardsProps) {
  const values = { total, completed, inProgress, pending, overdue };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {items.map(({ key, label, icon: Icon, color }) => (
        <Card key={key} className="animate-fade-up">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className={`h-4 w-4 ${color}`} />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{values[key]}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
