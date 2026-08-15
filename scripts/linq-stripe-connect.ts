// Starts the Linq → Stripe connect flow for Agent Pay and prints the
// onboarding URL to finish in a browser. Payments then settle to that
// Stripe account and payment_requests start returning checkout_urls.
// Run: pnpm exec tsx --env-file=.env scripts/linq-stripe-connect.ts

const BASE = "https://api.linqapp.com/api/partner";

async function main() {
  const key = process.env.LINQ_API_KEY;
  if (!key) throw new Error("Set LINQ_API_KEY in .env first");
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };

  const status = await fetch(`${BASE}/v3/payments/providers/stripe`, {
    headers,
  });
  console.log(`provider status → ${status.status}`);
  console.log(JSON.stringify(await status.json().catch(() => null), null, 2));

  const res = await fetch(`${BASE}/v3/payments/providers/stripe/connect`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  console.log(`connect → ${res.status}`);
  console.log(JSON.stringify(await res.json().catch(() => null), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
