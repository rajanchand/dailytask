import { GreetingClock } from "@/components/dashboard/greeting-clock";
import { StatCards } from "@/components/dashboard/stat-cards";
import { TaskCard } from "@/components/tasks/task-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { getDashboardStats, getTasks } from "@/server/actions/tasks";
import { EodSummaryActions } from "@/components/dashboard/eod-summary-actions";
import { getRecentActivity } from "@/server/actions/activity";
import { tomorrowISO, formatDisplayDate } from "@/lib/utils";
import Link from "next/link";
import { Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const [tomorrowTasks, overdueTasks, activity] = await Promise.all([
    getTasks({ date: tomorrowISO(), assignedToMe: true }),
    getTasks({ overdue: true, assignedToMe: true }),
    getRecentActivity(8),
  ]);

  const remaining = stats.tasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled",
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <GreetingClock name={stats.user.name} />
        <Button asChild>
          <Link href="/planner">
            <Plus className="h-4 w-4" />
            Open Planner
          </Link>
        </Button>
      </div>

      <StatCards
        total={stats.total}
        completed={stats.completed}
        inProgress={stats.inProgress}
        pending={stats.pending}
        overdue={stats.overdue}
      />

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Today&apos;s Productivity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {stats.completed} of {stats.total} completed
            </span>
            <span className="font-semibold tabular-nums">{stats.progress}%</span>
          </div>
          <Progress value={stats.progress} className="h-3" />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today&apos;s Tasks</h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/planner">View planner</Link>
            </Button>
          </div>
          {stats.tasks.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 py-10 text-center">
                <p className="text-lg font-medium">No tasks today 🎉</p>
                <p className="text-sm text-muted-foreground">You are completely clear.</p>
                <Button asChild>
                  <Link href="/planner">Create Task</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {stats.tasks.slice(0, 6).map((task) => (
                <TaskCard key={task.id} task={task} href="/planner" />
              ))}
            </div>
          )}
        </section>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="font-medium">Tomorrow</p>
                <p className="text-muted-foreground">
                  {tomorrowTasks.length} task{tomorrowTasks.length !== 1 ? "s" : ""} ·{" "}
                  {formatDisplayDate(tomorrowISO())}
                </p>
                <ul className="mt-2 space-y-1">
                  {tomorrowTasks.slice(0, 3).map((t) => (
                    <li key={t.id}>• {t.title}</li>
                  ))}
                  {tomorrowTasks.length === 0 && (
                    <li className="text-muted-foreground">Nothing scheduled</li>
                  )}
                </ul>
              </div>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="font-medium text-destructive">Overdue</p>
                <p className="text-muted-foreground">
                  {overdueTasks.filter((t) => t.status !== "completed").length} urgent
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {activity.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent activity.</p>
              )}
              {activity.map((item) => (
                <div key={item.id} className="border-b border-border/60 pb-3 last:border-0 last:pb-0">
                  <p className="text-sm">
                    <span className="font-medium">{item.userName ?? "System"}</span>{" "}
                    <span className="text-muted-foreground">{item.action.replaceAll(".", " ")}</span>
                    {item.title ? (
                      <>
                        {" "}
                        <span className="font-medium">&quot;{item.title}&quot;</span>
                      </>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(item.createdAt, { addSuffix: true })}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {remaining.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle>End of Day Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You still have {remaining.length} pending task{remaining.length !== 1 ? "s" : ""}.
            </p>
            <ul className="space-y-1 text-sm">
              {remaining.slice(0, 5).map((t) => (
                <li key={t.id}>• {t.title}</li>
              ))}
            </ul>
            <EodSummaryActions date={stats.date} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
