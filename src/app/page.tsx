import OpsBoard from "@/components/OpsBoard";
import { listOrders, totalRevenueCents } from "@/lib/store";
import { recentEvents } from "@/lib/log";

// Server-rendered snapshot: tickets, proofs, and the press log paint on
// first byte — no client fetch waterfall. OpsBoard keeps it live after.
export const dynamic = "force-dynamic";

export default async function Home() {
  const [orders, revenueCents] = await Promise.all([
    listOrders(),
    totalRevenueCents(),
  ]);
  return (
    <OpsBoard
      initialOrders={orders}
      initialRevenueCents={revenueCents}
      initialEvents={recentEvents()}
    />
  );
}
