import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: "Dailytask Manager",
    timestamp: new Date().toISOString(),
  });
}
