import crypto from "node:crypto";
import { logEvent } from "./log";

// Linq Partner API v3 client. Base URL + payload shapes verified against
// https://cdn.linqapp.com/openapi/linq-api-v3.yaml (2026-08-15).
// LINQ_SIMULATE=1 logs sends instead of hitting the API (local testing).

const BASE = "https://api.linqapp.com/api/partner";

const simulated = () => process.env.LINQ_SIMULATE === "1";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function linqFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env.LINQ_API_KEY;
  if (!key) throw new Error("LINQ_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Linq ${res.status} ${path}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export type MessagePart =
  | { type: "text"; value: string }
  | { type: "media"; url: string };

export type ScreenEffect =
  | "confetti"
  | "fireworks"
  | "sparkles"
  | "celebration"
  | "hearts"
  | "balloons"
  | "happy_birthday";

function extractMessageIds(json: any): string[] {
  const ids: string[] = [];
  for (const m of json?.messages ?? (json?.message ? [json.message] : [])) {
    if (m?.id) ids.push(String(m.id));
  }
  if (json?.id) ids.push(String(json.id));
  return ids;
}

export async function sendParts(
  chatId: string,
  parts: MessagePart[],
  effect?: ScreenEffect,
): Promise<string[]> {
  if (simulated()) {
    logEvent("webhook", `SIMULATED send → chat ${chatId}`, { parts, effect });
    return [`sim-${Date.now()}`];
  }
  const body = {
    message: {
      parts,
      ...(effect ? { effect: { type: "screen", name: effect } } : {}),
    },
  };
  const json = await linqFetch(`/v3/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const ids = extractMessageIds(json);
  logEvent("webhook", `sent ${parts.map((p) => p.type).join("+")} → chat`, {
    chatId,
    ids,
  });
  return ids;
}

export function sendText(chatId: string, text: string, effect?: ScreenEffect) {
  return sendParts(chatId, [{ type: "text", value: text }], effect);
}

export function sendPage(
  chatId: string,
  imageUrl: string,
  caption: string,
): Promise<string[]> {
  return sendParts(chatId, [
    { type: "media", url: imageUrl },
    { type: "text", value: caption },
  ]);
}

/**
 * Creates a payment request (Apple Pay / card checkout). Returns the
 * checkout_url, or null when the connected Stripe account isn't ready yet
 * (Linq returns 403 until charges are enabled) — callers must degrade
 * gracefully.
 */
export async function createPaymentRequest(
  amountCents: number,
  description: string,
  metadata: Record<string, string>,
): Promise<string | null> {
  if (simulated()) {
    logEvent("payment", "SIMULATED payment request", { amountCents });
    return "https://example.com/simulated-checkout";
  }
  try {
    const json = await linqFetch(`/v3/payment_requests`, {
      method: "POST",
      body: JSON.stringify({
        amount: amountCents,
        currency: "usd",
        description,
        metadata,
      }),
    });
    const url = json?.checkout_url ?? json?.payment_request?.checkout_url ?? null;
    logEvent("payment", "payment request created", { amountCents, url });
    return url;
  } catch (err) {
    logEvent("payment", "payment request unavailable (Stripe not connected?)", {
      error: String(err).slice(0, 200),
    });
    return null;
  }
}

/**
 * Standard Webhooks signature verification (webhook-id / webhook-timestamp /
 * webhook-signature, HMAC-SHA256 over "{id}.{timestamp}.{body}"). With no
 * LINQ_WEBHOOK_SECRET configured, verification is skipped (local dev).
 */
export function verifyLinqWebhook(rawBody: string, headers: Headers): boolean {
  const secret = process.env.LINQ_WEBHOOK_SECRET;
  if (!secret) return true;

  const msgId = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!msgId || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const secretStr = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(secretStr, "base64");
  const expected = crypto
    .createHmac("sha256", keyBytes)
    .update(`${msgId}.${timestamp}.${rawBody}`)
    .digest("base64");

  return signature.split(" ").some((sig) => {
    if (!sig.startsWith("v1,")) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, "base64"),
        Buffer.from(sig.slice(3), "base64"),
      );
    } catch {
      return false;
    }
  });
}
