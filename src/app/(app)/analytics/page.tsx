import { auth } from "@/server/auth";
import { hasPermission } from "@/server/rbac";
import type { Role } from "@/server/db/schema";
import { AccessDenied } from "@/components/access-denied";
import { getAnalyticsData } from "@/server/actions/analytics";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.role as Role, "analytics.view")) {
    return <AccessDenied title="Analytics access required" />;
  }

  const data = await getAnalyticsData();
  return <AnalyticsCharts data={data} />;
}
