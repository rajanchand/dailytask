import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { getReportsOverview } from "@/server/actions/reports";
import { buildTodayReportPdf } from "@/server/services/report-pdf";
import { rateLimitAction } from "@/server/security/rate-limit";
import { todayISO } from "@/lib/utils";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = await rateLimitAction("pdf_today", 15, 60, session.user.id);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many downloads. Try again shortly." },
      {
        status: 429,
        headers: limited.retryAfterSec
          ? { "Retry-After": String(limited.retryAfterSec) }
          : undefined,
      },
    );
  }

  const overview = await getReportsOverview();
  const pdf = await buildTodayReportPdf({
    date: overview.today.date,
    total: overview.today.total,
    completed: overview.today.completed,
    inProgress: overview.today.inProgress,
    pending: overview.today.pending,
    overdue: overview.today.overdue,
    progress: overview.today.progress,
    completedTitles: overview.today.completedTitles,
    remainingTitles: overview.today.remainingTitles,
    generatedBy: session.user.name || session.user.email,
  });

  const filename = `dailytask-today-${todayISO()}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
