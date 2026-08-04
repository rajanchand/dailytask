import { getTasks, getTaskFormOptions } from "@/server/actions/tasks";
import { PlannerClient } from "@/components/planner/planner-client";
import { todayISO } from "@/lib/utils";

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const date = params.date || todayISO();
  const [tasks, options] = await Promise.all([
    getTasks({ date }),
    getTaskFormOptions(),
  ]);

  return <PlannerClient date={date} tasks={tasks} options={options} />;
}
