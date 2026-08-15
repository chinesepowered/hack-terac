// Local end-to-end simulation: posts fake Linq webhooks at the dev server.
// Requires the dev server running with LINQ_SIMULATE=1 so outbound sends are
// logged instead of hitting Linq. Watch the dashboard while this runs.
// Run: pnpm exec tsx scripts/sim-conversation.ts

const WEBHOOK = "http://localhost:3000/api/linq/webhook";
const CHAT_ID = "sim-chat-1";
const SENDER = "nelson.uw@gmail.com";

async function post(payload: unknown) {
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  console.log(`webhook → ${res.status}`, await res.text());
}

function message(text: string) {
  return {
    event_type: "message.received",
    payload: {
      direction: "inbound",
      sender_handle: SENDER,
      chat: { id: CHAT_ID, is_group: false },
      parts: [{ type: "text", value: text }],
    },
  };
}

async function main() {
  console.log("1) bare greeting → expect welcome");
  await post(message("hi"));
  await new Promise((r) => setTimeout(r, 3000));

  console.log("2) the brief → expect confirmation + generation kickoff");
  await post(
    message(
      "my daughter Maya is 4, obsessed with excavators and diggers, " +
        "does everything with our orange cat Biscuit. her birthday is " +
        "friday at grandma's farm!",
    ),
  );
  console.log(
    "\nGeneration is now streaming — watch http://localhost:3000 and the " +
      "server logs. Book lands in data/orders/.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
