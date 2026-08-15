import { logEvent } from "./log";

// Stripe Checkout via bare REST (form-encoded) — no SDK needed for one call.
// Works identically in test mode (sk_test_) and live mode (sk_live_): swapping
// STRIPE_SECRET_KEY in .env is the only change. NOTE: test-mode payments do
// NOT count as real revenue for the agent-company prize.

export async function createCheckoutUrl(opts: {
  amountCents: number;
  productName: string;
  successUrl: string;
  metadata: Record<string, string>;
}): Promise<string | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const params = new URLSearchParams({
    mode: "payment",
    success_url: opts.successUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(opts.amountCents),
    "line_items[0][price_data][product_data][name]": opts.productName,
  });
  for (const [k, v] of Object.entries(opts.metadata)) {
    params.set(`metadata[${k}]`, v);
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `Stripe ${res.status}`);
    logEvent("payment", "Stripe checkout session created", {
      amountCents: opts.amountCents,
      testMode: key.startsWith("sk_test_"),
    });
    return json.url ?? null;
  } catch (err) {
    logEvent("error", "Stripe checkout failed", { error: String(err).slice(0, 200) });
    return null;
  }
}
