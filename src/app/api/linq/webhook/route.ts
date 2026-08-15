import { NextRequest, NextResponse } from "next/server";
import { verifyLinqWebhook } from "@/lib/linq";
import { handleInboundMessage, handleReaction } from "@/lib/conversation";
import { logEvent } from "@/lib/log";

// Linq webhook receiver. Subscribed with ?version=2026-02-03 but parsing is
// defensive across both payload versions. Sender IDs are opaque strings —
// never parse them as phone numbers (email-handle iMessage customers exist).

/* eslint-disable @typescript-eslint/no-explicit-any */

function field(payload: any, ...names: string[]): any {
  for (const n of names) {
    const v = n.split(".").reduce((o, k) => o?.[k], payload);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function extractText(payload: any): string {
  const parts = field(payload, "parts", "message.parts") ?? [];
  return parts
    .filter((p: any) => p?.type === "text")
    .map((p: any) => p.value ?? p.text ?? "")
    .join("\n")
    .trim();
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyLinqWebhook(rawBody, req.headers)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const type =
    event.event_type ?? event.type ?? event.event ?? req.headers.get("x-webhook-event") ?? "";
  const payload = event.payload ?? event.data ?? event;
  const chatId = field(payload, "chat.id", "chat_id");
  // Live payloads carry sender_handle as a participant object {handle, ...}.
  const senderRaw = field(payload, "sender_handle", "from_handle", "sender");
  const sender =
    typeof senderRaw === "object" && senderRaw
      ? (senderRaw.handle ?? null)
      : senderRaw;

  logEvent("webhook", `linq ${type || "unknown-event"}`, { chatId, sender });

  try {
    if (type.startsWith("message.received")) {
      const inbound =
        field(payload, "direction") === "inbound" ||
        field(payload, "is_from_me") === false ||
        field(payload, "direction") === undefined;
      const text = extractText(payload);
      if (inbound && chatId && sender && text) {
        await handleInboundMessage(String(chatId), String(sender), text);
      }
    } else if (type.startsWith("reaction.added") || type.startsWith("message.reaction")) {
      const reaction = String(
        field(payload, "reaction", "reaction_type", "reaction.type") ?? "",
      );
      const messageId = field(payload, "message_id", "message.id");
      if (chatId && sender) {
        await handleReaction(
          String(chatId),
          String(sender),
          reaction,
          messageId ? String(messageId) : null,
        );
      }
    }
  } catch (err) {
    // Always 200 so Linq doesn't retry a poison message; failures are logged.
    logEvent("error", "webhook handling failed", { error: String(err).slice(0, 300) });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "linq-webhook" });
}
