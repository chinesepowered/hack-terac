import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { sendText } from "@/lib/linq";
import { getOrCreateOrder, updateOrder } from "@/lib/store";
import { logEvent } from "@/lib/log";

// Stripe webhook: checkout.session.completed closes the loop — order marked
// paid, revenue counted, and the agent thanks the customer in iMessage with
// the keepsake download link.

/* eslint-disable @typescript-eslint/no-explicit-any */

function verifyStripeSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return true; // not configured yet — dev convenience
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string]),
  );
  if (!parts.t || !parts.v1) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyStripeSignature(rawBody, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object ?? {};
    const chatId = session.metadata?.chat_id;
    const bookId = session.metadata?.book_id;
    const amount = Number(session.amount_total ?? 0);
    const testMode = event.livemode === false;
    logEvent("payment", `checkout completed${testMode ? " (TEST MODE)" : ""}`, {
      chatId,
      bookId,
      amount,
    });

    if (chatId && session.payment_status === "paid") {
      const order = await getOrCreateOrder(chatId, "unknown");
      await updateOrder(chatId, {
        status: "paid",
        revenueCents: order.revenueCents + amount,
      });
      const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
      const keepsake =
        base && bookId ? `${base}/api/books/${bookId}/book.html` : null;
      await sendText(
        chatId,
        `Paid — it's yours forever! 🎉 Thank you.` +
          (keepsake
            ? `\n\nYour keepsake edition (open it, hit print for the real ` +
              `thing): ${keepsake}`
            : "") +
          (testMode ? `\n\n(Test-mode purchase — no real charge.)` : ""),
        "confetti",
      ).catch((err) =>
        logEvent("error", "thank-you send failed", { error: String(err) }),
      );
    }
  }

  return NextResponse.json({ received: true });
}
