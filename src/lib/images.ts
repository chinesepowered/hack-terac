import { logEvent } from "./log";

// Image generation behind one interface with a primary → fallback chain
// (IMAGE_PROVIDER / IMAGE_FALLBACK_PROVIDER). Reference images carry the
// character sheet so the same hero renders on every page — providers that
// can't take references (plain flux) must not be wired in here.

export type ImageRequest = {
  prompt: string;
  /** Image bytes used as identity references (character sheet, prior pages). */
  referenceImages?: Buffer[];
};

type Provider = "together" | "gemini" | "openai";

function sniffMime(img: Buffer): string {
  // FLUX returns JPEG bytes even when requested as b64; label refs correctly.
  return img[0] === 0xff && img[1] === 0xd8 ? "image/jpeg" : "image/png";
}

async function generateTogether(req: ImageRequest): Promise<Buffer> {
  const key = process.env.TOGETHER_API_KEY;
  const model =
    process.env.TOGETHER_IMAGE_MODEL || "black-forest-labs/FLUX.2-pro";
  if (!key) throw new Error("TOGETHER_API_KEY not set");

  const body: Record<string, unknown> = {
    model,
    prompt: req.prompt,
    n: 1,
    response_format: "b64_json",
  };
  const ref = req.referenceImages?.[0];
  if (ref) {
    // Data-URI refs verified working on FLUX.2-pro (identity held across pages).
    body.image_url = `data:${sniffMime(ref)};base64,${ref.toString("base64")}`;
  }
  const res = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Together ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const item = json.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) {
    const img = await fetch(item.url);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error("Together response contained no image");
}

async function generateGemini(req: ImageRequest): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const parts: unknown[] = [{ text: req.prompt }];
  for (const img of req.referenceImages ?? []) {
    parts.push({
      inline_data: { mime_type: sniffMime(img), data: img.toString("base64") },
    });
  }
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }] }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json();
  for (const part of json.candidates?.[0]?.content?.parts ?? []) {
    const data = part.inlineData?.data ?? part.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini response contained no image");
}

async function generateOpenAi(req: ImageRequest): Promise<Buffer> {
  const key = process.env.OPENAI_IMAGE_API_KEY;
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  if (!key) throw new Error("OPENAI_IMAGE_API_KEY not set");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt: req.prompt, n: 1, size: "1024x1024" }),
  });
  if (!res.ok) throw new Error(`OpenAI images ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response contained no image");
  return Buffer.from(b64, "base64");
}

const generators: Record<Provider, (req: ImageRequest) => Promise<Buffer>> = {
  together: generateTogether,
  gemini: generateGemini,
  openai: generateOpenAi,
};

// Rate limits and blips get exponential backoff (Together's 429 guidance).
// Content-policy 400s are NOT retried here — the caller softens the prompt.
const TRANSIENT = /429|5\d{2}|ECONN|ETIMEDOUT|fetch failed|socket/i;

async function withBackoff(
  gen: (req: ImageRequest) => Promise<Buffer>,
  req: ImageRequest,
  tries = 3,
): Promise<Buffer> {
  let delayMs = 2500;
  for (let attempt = 1; ; attempt++) {
    try {
      return await gen(req);
    } catch (err) {
      if (attempt >= tries || !TRANSIENT.test(String(err))) throw err;
      logEvent("image", `transient error, retrying in ${delayMs / 1000}s`, {
        attempt,
        error: String(err).slice(0, 120),
      });
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs *= 3;
    }
  }
}

export async function generateImage(req: ImageRequest): Promise<Buffer> {
  const primary = (process.env.IMAGE_PROVIDER || "together") as Provider;
  const fallback = process.env.IMAGE_FALLBACK_PROVIDER as Provider | undefined;

  try {
    const out = await withBackoff(generators[primary], req);
    logEvent("image", `served by ${primary}`);
    return out;
  } catch (err) {
    if (!fallback || fallback === primary) {
      logEvent("error", `image provider ${primary} failed`, { error: String(err) });
      throw err;
    }
    logEvent("error", `image provider ${primary} failed, trying ${fallback}`, {
      error: String(err),
    });
    const out = await withBackoff(generators[fallback], req);
    logEvent("image", `served by fallback ${fallback}`);
    return out;
  }
}
