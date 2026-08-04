import { getReportsOverview } from "@/server/actions/reports";
import { ReportsClient } from "@/components/reports/reports-client";

export default async function ReportsPage() {
  const overview = await getReportsOverview();
  return <ReportsClient overview={overview} />;
}
