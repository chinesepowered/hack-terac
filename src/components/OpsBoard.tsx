"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

// Studio ops board (client half): server renders the initial snapshot so
// tickets and proofs paint immediately; this component keeps it live with
// adaptive polling afterwards.

export type Order = {
  id: string;
  chatId: string;
  senderHandle: string;
  status: string;
  bookId?: string;
  bookTitle?: string;
  pageMessages: Record<string, number>;
  paymentUrl?: string | null;
  revenueCents: number;
  updatedAt: number;
};

export type OpsEvent = {
  ts: number;
  kind: string;
  message: string;
};

const STATUS_LABEL: Record<string, string> = {
  collecting: "Hearing the brief",
  generating: "At the easel",
  review: "Proofs delivered",
  payment_sent: "Invoice sent",
  paid: "Paid",
};

const KIND_COLOR: Record<string, string> = {
  llm: "var(--moon-dim)",
  image: "#7ea6e0",
  extract: "#b48ede",
  webhook: "#8bc28c",
  order: "var(--lamp)",
  payment: "var(--lamp)",
  error: "var(--ember)",
};

export default function OpsBoard({
  initialOrders,
  initialRevenueCents,
  initialEvents,
}: {
  initialOrders: Order[];
  initialRevenueCents: number;
  initialEvents: OpsEvent[];
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [revenueCents, setRevenueCents] = useState(initialRevenueCents);
  const [events, setEvents] = useState<OpsEvent[]>(initialEvents);

  useEffect(() => {
    // Adaptive refresh: 2.5s only while the studio is actively working
    // (an order generating, or events younger than 30s), 15s when idle,
    // paused entirely while the tab is hidden.
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      let busy = false;
      try {
        const [o, e] = await Promise.all([
          fetch("/api/orders").then((r) => r.json()),
          fetch("/api/events").then((r) => r.json()),
        ]);
        if (!live) return;
        const orders: Order[] = o.orders ?? [];
        const events: OpsEvent[] = e.events ?? [];
        setOrders(orders);
        setRevenueCents(o.revenueCents ?? 0);
        setEvents(events);
        busy =
          orders.some((x) => x.status === "generating") ||
          (events[0]?.ts ?? 0) > Date.now() - 30_000;
      } catch {
        /* next poll retries */
      }
      if (live) timer = setTimeout(tick, busy ? 2500 : 15_000);
    };

    const onVisibility = () => {
      clearTimeout(timer);
      if (!document.hidden && live) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Server rendered the current snapshot — first refresh can wait a beat.
    timer = setTimeout(tick, 5000);
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const pagesPainted = events.filter((e) =>
    e.message.includes("illustrated"),
  ).length;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="display text-4xl font-semibold tracking-tight">
            StoryLine
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--moon-dim)" }}>
            An agent-run storybook studio · open all night
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm" style={{ color: "var(--moon-dim)" }}>
            Commission a book — text the studio
          </p>
          <p className="display text-2xl" style={{ color: "var(--lamp)" }}>
            +1 (424) 394-5422
          </p>
          <nav className="mt-1 flex justify-end gap-4 text-sm">
            {orders.find((o) => o.bookId) && (
              <Link
                href={`/book/${orders.find((o) => o.bookId)!.bookId}`}
                className="underline underline-offset-4"
                style={{ color: "var(--moon-dim)" }}
              >
                Read a finished book
              </Link>
            )}
            <Link
              href="/study"
              className="underline underline-offset-4"
              style={{ color: "var(--moon-dim)" }}
            >
              Style study
            </Link>
          </nav>
        </div>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Meter
          label="Tonight's takings"
          value={`$${(revenueCents / 100).toFixed(2)}`}
          lamp
        />
        <Meter label="Commissions" value={String(orders.length)} />
        <Meter label="Pages painted" value={String(pagesPainted)} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section>
          <h2 className="stamp inline-block" style={{ color: "var(--moon-dim)" }}>
            Job rail
          </h2>
          <div className="mt-3 space-y-4">
            {orders.length === 0 && (
              <p className="text-sm" style={{ color: "var(--moon-dim)" }}>
                The rail is empty. First text of the night starts the presses.
              </p>
            )}
            {orders.map((o) => (
              <Ticket key={o.id} order={o} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="stamp inline-block" style={{ color: "var(--moon-dim)" }}>
            Press log
          </h2>
          <div
            className="mt-3 max-h-[32rem] space-y-1 overflow-y-auto rounded-lg border p-3 font-mono text-xs"
            style={{ borderColor: "var(--dusk-3)", background: "var(--dusk-2)" }}
          >
            {events.map((e, i) => (
              <p key={i} className="flex items-baseline gap-2">
                <span style={{ color: KIND_COLOR[e.kind] ?? "var(--moon-dim)" }}>
                  ●
                </span>
                <span className="shrink-0" style={{ color: "var(--moon-dim)" }}>
                  {new Date(e.ts).toLocaleTimeString([], {
                    hour12: false,
                  })}
                </span>
                <span className="break-all">{e.message}</span>
              </p>
            ))}
            {events.length === 0 && (
              <p style={{ color: "var(--moon-dim)" }}>Presses warm. Quiet so far.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Meter({
  label,
  value,
  lamp,
}: {
  label: string;
  value: string;
  lamp?: boolean;
}) {
  return (
    <div className="ticket p-4">
      <p
        className="text-xs uppercase tracking-wide"
        style={{ color: "var(--moon-dim)" }}
      >
        {label}
      </p>
      <p
        className="display mt-1 text-3xl"
        style={lamp ? { color: "var(--lamp)" } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function Ticket({ order }: { order: Order }) {
  const pages = Object.values(order.pageMessages).sort((a, b) => a - b);
  const uniquePages = [...new Set(pages)];
  const busy = order.status === "generating";
  return (
    <article className="ticket overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <h3 className="display text-xl">
          {order.bookId ? (
            <Link href={`/book/${order.bookId}`} className="hover:underline">
              {order.bookTitle ?? `Commission for ${order.senderHandle}`}
            </Link>
          ) : (
            (order.bookTitle ?? `Commission for ${order.senderHandle}`)
          )}
        </h3>
        <span
          className={`stamp ${busy ? "pulse" : ""}`}
          style={{
            color:
              order.status === "paid"
                ? "var(--leaf)"
                : busy
                  ? "var(--lamp)"
                  : "var(--moon-dim)",
          }}
        >
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>
      <p className="px-4 pt-1 text-xs" style={{ color: "var(--moon-dim)" }}>
        {order.senderHandle}
        {order.paymentUrl ? " · invoice out" : ""}
        {order.revenueCents > 0
          ? ` · paid $${(order.revenueCents / 100).toFixed(2)}`
          : ""}
      </p>
      {order.bookId && uniquePages.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {uniquePages.map((n) => (
            <Image
              key={n}
              src={`/api/books/${order.bookId}/page-${n}.jpg`}
              alt={`Page ${n} proof`}
              width={80}
              height={80}
              className="page-card h-20 w-20 shrink-0 object-cover"
            />
          ))}
        </div>
      )}
      <div className="ticket-edge" />
    </article>
  );
}
