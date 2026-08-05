import { getTasks } from "@/server/actions/tasks";
import { getCalendarEntries } from "@/server/actions/calendar-entries";
import { CalendarView } from "@/components/tasks/calendar-view";
import { format, subDays, addDays } from "date-fns";

export default async function CalendarPage() {
  const from = format(subDays(new Date(), 30), "yyyy-MM-dd");
  const to = format(addDays(new Date(), 60), "yyyy-MM-dd");
  const [tasks, entries] = await Promise.all([
    getTasks({ from, to }),
    getCalendarEntries({ from, to }),
  ]);

  return <CalendarView tasks={tasks} entries={entries} />;
}
