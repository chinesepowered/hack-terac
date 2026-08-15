import fs from "node:fs/promises";
import path from "node:path";

// Order store: one JSON file, loaded lazily, saved after every mutation.
// Single-process dev server — no locking needed at hackathon scale.

export type OrderStatus =
  | "collecting"
  | "generating"
  | "review"
  | "payment_sent"
  | "paid";

export type Order = {
  id: string;
  chatId: string;
  senderHandle: string;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  /** Raw inbound texts collected toward the story brief. */
  inbox: string[];
  bookId?: string;
  bookTitle?: string;
  /** Linq message id → page number, for tapback-driven repaints. */
  pageMessages: Record<string, number>;
  paymentUrl?: string | null;
  revenueCents: number;
};

type State = { orders: Record<string, Order>; revenueCents: number };

const STATE_PATH = path.join(process.cwd(), "data", "state.json");
let state: State | null = null;

async function load(): Promise<State> {
  if (state) return state;
  try {
    state = JSON.parse(await fs.readFile(STATE_PATH, "utf8")) as State;
  } catch {
    state = { orders: {}, revenueCents: 0 };
  }
  return state;
}

async function save() {
  if (!state) return;
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

export async function getOrCreateOrder(
  chatId: string,
  senderHandle: string,
): Promise<Order> {
  const s = await load();
  if (!s.orders[chatId]) {
    s.orders[chatId] = {
      id: `order-${Date.now()}`,
      chatId,
      senderHandle,
      status: "collecting",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      inbox: [],
      pageMessages: {},
      revenueCents: 0,
    };
    await save();
  }
  return s.orders[chatId];
}

export async function updateOrder(
  chatId: string,
  patch: Partial<Order>,
): Promise<Order> {
  const s = await load();
  const order = s.orders[chatId];
  if (!order) throw new Error(`no order for chat ${chatId}`);
  Object.assign(order, patch, { updatedAt: Date.now() });
  await save();
  return order;
}

export async function listOrders(): Promise<Order[]> {
  const s = await load();
  return Object.values(s.orders).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function totalRevenueCents(): Promise<number> {
  const s = await load();
  return (
    s.revenueCents +
    Object.values(s.orders).reduce((sum, o) => sum + o.revenueCents, 0)
  );
}
