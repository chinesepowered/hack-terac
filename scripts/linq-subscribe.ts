// Subscribes the Linq webhook to PUBLIC_BASE_URL/api/linq/webhook (pinned to
// payload version 2026-02-03) and prints the signing secret if returned.
// Run: pnpm exec tsx --env-file=.env scripts/linq-subscribe.ts

const BASE = "https://api.linqapp.com/api/partner";

async function main() {
  const key = process.env.LINQ_API_KEY;
  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!key || !publicBase) {
    throw new Error("Set LINQ_API_KEY and PUBLIC_BASE_URL in .env first");
  }
  const url = `${publicBase}/api/linq/webhook?version=2026-02-03`;

  const existing = await fetch(`${BASE}/v3/webhook-subscriptions`, {
    headers: { Authorization: `Bearer ${key}` },
  }).then((r) => r.json());
  console.log("existing subscriptions:", JSON.stringify(existing, null, 2));

  const res = await fetch(`${BASE}/v3/webhook-subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target_url: url,
      subscribed_events: ["message.received", "reaction.added"],
    }),
  });
  const json = await res.json().catch(() => null);
  console.log(`create → ${res.status}`);
  console.log(JSON.stringify(json, null, 2));
  console.log(
    "\nIf a signing secret appears above, put it in .env as LINQ_WEBHOOK_SECRET.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
