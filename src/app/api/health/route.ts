import { NextResponse } from "next/server";
import { APP_NAME } from "@/lib/brand";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: APP_NAME,
    timestamp: new Date().toISOString(),
  });
}
