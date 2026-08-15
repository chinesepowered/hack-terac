// In-memory ring buffer of operational events. The ops dashboard reads this to
// show which backend served each request (Pioneer vs fallback, primary vs
// fallback image provider) and the live Linq webhook feed.

export type OpsEvent = {
  ts: number;
  kind:
    | "llm"
    | "image"
    | "extract"
    | "webhook"
    | "order"
    | "payment"
    | "error";
  message: string;
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 500;
const events: OpsEvent[] = [];

export function logEvent(
  kind: OpsEvent["kind"],
  message: string,
  data?: Record<string, unknown>,
) {
  events.push({ ts: Date.now(), kind, message, data });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  console.log(`[${kind}] ${message}`, data ?? "");
}

export function recentEvents(limit = 100): OpsEvent[] {
  return events.slice(-limit).reverse();
}
