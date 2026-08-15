import { NextResponse } from "next/server";
import { listOrders, totalRevenueCents } from "@/lib/store";

export const dynamic = "force-dynamic";

// Dashboard feed: all orders plus the running revenue counter.
export async function GET() {
  const [orders, revenueCents] = await Promise.all([
    listOrders(),
    totalRevenueCents(),
  ]);
  return NextResponse.json({ orders, revenueCents });
}
