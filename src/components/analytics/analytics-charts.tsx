"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/lib/utils";

const COLORS = ["#0d9488", "#059669", "#d97706", "#dc2626", "#6366f1", "#64748b"];

type AnalyticsData = {
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dailyTrend: { date: string; total: number; completed: number; rate: number }[];
  statusChart: { status: string; count: number }[];
  priorityChart: { priority: string; count: number }[];
};

export function AnalyticsCharts({ data }: { data: AnalyticsData }) {
  const completionRate = data.totalTasks
    ? Math.round((data.completedTasks / data.totalTasks) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Total Tasks</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{data.totalTasks}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Completion Rate</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{completionRate}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-destructive">{data.overdueTasks}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Daily Completion Trend</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="completed" stroke="#0d9488" name="Completed" />
              <Line type="monotone" dataKey="total" stroke="#64748b" name="Total" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>By Status</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.statusChart.map((s) => ({ ...s, label: STATUS_LABELS[s.status] ?? s.status }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>By Priority</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.priorityChart.map((p) => ({ ...p, label: PRIORITY_LABELS[p.priority] ?? p.priority }))}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label
                >
                  {data.priorityChart.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
