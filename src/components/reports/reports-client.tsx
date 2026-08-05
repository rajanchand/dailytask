"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  FileText,
  Send,
  CalendarRange,
  ListChecks,
  BarChart3,
  CheckCircle2,
  Download,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { sendReportToDiscordAction } from "@/server/actions/reports";
import type { ReportKind } from "@/server/services/discord-commands";
import { formatDisplayDate } from "@/lib/utils";

type Overview = {
  today: {
    date: string;
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    overdue: number;
    progress: number;
    remainingTitles: string[];
    completedTitles: string[];
  };
  week: {
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    rate: number;
  } | null;
};

const reportButtons: {
  kind: ReportKind;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    kind: "daily",
    label: "Daily Report",
    description: "Full summary for today",
    icon: FileText,
  },
  {
    kind: "weekly",
    label: "Weekly Report",
    description: "Last 7 days overview",
    icon: CalendarRange,
  },
  {
    kind: "today_tasks",
    label: "Today Task List",
    description: "All tasks scheduled today",
    icon: ListChecks,
  },
  {
    kind: "today_stats",
    label: "Today Totals",
    description: "Counts and progress %",
    icon: BarChart3,
  },
  {
    kind: "today_completed",
    label: "Completed Today",
    description: "Finished tasks only",
    icon: CheckCircle2,
  },
];

export function ReportsClient({ overview }: { overview: Overview }) {
  const [pending, startTransition] = useTransition();
  const [pdfPending, setPdfPending] = useState(false);
  const { today, week } = overview;

  function send(kind: ReportKind, label: string) {
    startTransition(async () => {
      const result = await sendReportToDiscordAction(kind);
      if (result?.ok) toast.success(`${label} sent to Discord`);
      else toast.error(result?.error || "Could not send report");
    });
  }

  async function downloadTodayPdf() {
    setPdfPending(true);
    try {
      const res = await fetch("/api/reports/today/pdf");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dailytask-today-${today.date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setPdfPending(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Reports</h2>
          <p className="text-sm text-muted-foreground">
            View summaries, download today as PDF, or send to Discord.
          </p>
        </div>
        <Button variant="outline" disabled={pdfPending} onClick={downloadTodayPdf}>
          <Download className="h-4 w-4" />
          {pdfPending ? "Preparing…" : "Download today PDF"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today — {formatDisplayDate(today.date)}</CardTitle>
          <CardDescription>Quick snapshot of your day</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Total", today.total],
              ["Done", today.completed],
              ["In Progress", today.inProgress],
              ["Pending", today.pending],
              ["Overdue", today.overdue],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-muted/60 p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Completion</span>
              <span className="font-semibold">{today.progress}%</span>
            </div>
            <Progress value={today.progress} className="h-3" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Completed</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {today.completedTitles.length === 0 && <li>None yet</li>}
                {today.completedTitles.slice(0, 6).map((t) => (
                  <li key={t}>✅ {t}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Remaining</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {today.remainingTitles.length === 0 && <li>All clear 🎉</li>}
                {today.remainingTitles.slice(0, 6).map((t) => (
                  <li key={t}>• {t}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {week && (
        <Card>
          <CardHeader>
            <CardTitle>This Week</CardTitle>
            <CardDescription>Last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Tasks</p>
                <p className="text-xl font-bold">{week.totalTasks}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-xl font-bold">{week.completedTasks}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Overdue</p>
                <p className="text-xl font-bold">{week.overdueTasks}</p>
              </div>
              <div className="rounded-xl bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Rate</p>
                <p className="text-xl font-bold">{week.rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="mb-3 text-lg font-semibold">Send to Discord</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reportButtons.map(({ kind, label, description, icon: Icon }) => (
            <Card key={kind} className="border-border/80">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-accent p-2 text-accent-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{description}</p>
                  </div>
                </div>
                <Button
                  className="mt-auto w-full"
                  variant="outline"
                  disabled={pending}
                  onClick={() => send(kind, label)}
                >
                  <Send className="h-4 w-4" />
                  Send Report
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Requires a webhook in Discord settings. In Discord you can also type:{" "}
          <code>report</code>, <code>daily report</code>, or <code>weekly report</code>
        </p>
      </div>
    </div>
  );
}
