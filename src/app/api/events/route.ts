import { NextResponse } from "next/server";
import { recentEvents } from "@/lib/log";

export const dynamic = "force-dynamic";

// Ops dashboard feed: recent operational events, newest first.
export async function GET() {
  return NextResponse.json({ events: recentEvents() });
}
