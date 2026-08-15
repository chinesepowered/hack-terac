// Re-triggers processing of an existing chat's inbox by injecting one signed
// message.received webhook at the local server (mirrors live payload shape).
import crypto from "node:crypto";

const CHAT_ID = "217506a5-bb95-412f-bba8-9a666b86128a";
const SECRET = process.env.LINQ_WEBHOOK_SECRET!;

const body = JSON.stringify({
  event_type: "message.received",
  payload: {
    direction: "inbound",
    sender_handle: {
      handle: "nelson.uw@gmail.com",
      service: "iMessage",
      is_me: false,
    },
    chat: { id: CHAT_ID, is_group: false },
    parts: [{ type: "text", value: "please go ahead and make it!" }],
  },
});

const id = `msg_retrigger_${Date.now()}`;
const ts = String(Math.floor(Date.now() / 1000));
const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
const sig = crypto
  .createHmac("sha256", key)
  .update(`${id}.${ts}.${body}`)
  .digest("base64");

fetch("http://localhost:3000/api/linq/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": ts,
    "webhook-signature": `v1,${sig}`,
  },
  body,
}).then(async (r) => console.log(r.status, await r.text()));
