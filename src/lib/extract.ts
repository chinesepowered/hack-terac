import { z } from "zod";
import { chat } from "./llm";
import { logEvent } from "./log";

// Story brief extraction: parent's rambling messages → structured entities.
// Primary path is GLiNER2 on Pioneer (prize track); it is deliberately off the
// critical path — any failure or timeout falls back to the EXTRACTOR_* LLM, so
// the product keeps working while Pioneer is down.

const looseAge = z.preprocess(
  (v) => (v == null || v === "" ? null : Number(v)),
  z.number().nullable().catch(null),
);
const looseList = z.preprocess(
  (v) => (typeof v === "string" ? v.split(/,\s*/) : (v ?? [])),
  z.array(z.string()),
);

export const StoryBriefSchema = z.object({
  // Best-effort: shape drift must never throw — an empty heroName just means
  // "not ready yet" and the agent asks a follow-up question.
  heroName: z.string().catch(""),
  age: looseAge,
  interests: looseList.catch([]),
  companions: looseList.catch([]),
  setting: z.string().nullish().catch(null),
  occasion: z.string().nullish().catch(null),
  notes: z.string().nullish().catch(null),
});
export type StoryBrief = z.infer<typeof StoryBriefSchema>;

/** Maps snake_case/aliased keys and unwraps single-key wrapper objects. */
export function normalizeBriefKeys(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  let obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 1 && obj[keys[0]] && typeof obj[keys[0]] === "object") {
    obj = obj[keys[0]] as Record<string, unknown>;
  }
  const alias: Record<string, string> = {
    hero_name: "heroName",
    name: "heroName",
    child_name: "heroName",
    childname: "heroName",
  };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[alias[k.toLowerCase()] ?? k] = v;
  return out;
}

/** Tolerates markdown fences and prose around the JSON object. */
export function parseJsonObject(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in output");
  return JSON.parse(raw.slice(start, end + 1));
}

const GLINER_LABELS = [
  "hero name",
  "age",
  "interest",
  "companion",
  "setting",
  "occasion",
];

// Pioneer native inference: POST {base}/inference (root-level, NOT under /v1),
// X-API-Key auth, body {model_id, text, schema, threshold} — confirmed against
// their docs + live probe 2026-08-15. Response entity shape is defensive below
// because the account hit the billing wall before we could observe a real one:
// TODO(verify): tighten parsing once a plan is active on agent.pioneer.ai.
async function extractViaPioneer(text: string): Promise<StoryBrief> {
  const baseURL = process.env.PIONEER_BASE_URL || "https://api.pioneer.ai";
  const apiKey = process.env.PIONEER_API_KEY;
  const model = process.env.PIONEER_GLINER_MODEL || "GLiNER2-Large";
  if (!apiKey) throw new Error("PIONEER_API_KEY not set");
  const timeoutMs = Number(process.env.PIONEER_TIMEOUT_MS || 6000);

  const res = await fetch(`${baseURL}/inference`, {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: model,
      text,
      schema: { entities: GLINER_LABELS },
      threshold: 0.3,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Pioneer ${res.status}: ${await res.text()}`);
  const json = await res.json();

  type Entity = Record<string, unknown>;
  const rawEntities: Entity[] =
    json.entities ?? json.result?.entities ?? json.data?.entities ?? [];
  const entities = rawEntities.map((e) => ({
    label: String(e.label ?? e.entity ?? e.type ?? ""),
    text: String(e.text ?? e.span ?? e.value ?? ""),
  }));
  const byLabel = (label: string) =>
    entities.filter((e) => e.label === label && e.text).map((e) => e.text);

  const heroName = byLabel("hero name")[0];
  if (!heroName) throw new Error("GLiNER2 found no hero name");
  const age = Number(byLabel("age")[0]);
  return StoryBriefSchema.parse({
    heroName,
    age: Number.isFinite(age) ? age : undefined,
    interests: byLabel("interest"),
    companions: byLabel("companion"),
    setting: byLabel("setting")[0],
    occasion: byLabel("occasion")[0],
  });
}

async function extractViaLlm(text: string): Promise<StoryBrief> {
  const raw = await chat(
    "extractor",
    `Extract a story brief from this parent's message about their child. ` +
      `Return JSON with keys: heroName (string), age (number or null), ` +
      `interests (string[]), companions (string[] — pets, siblings, toys), ` +
      `setting (string or null), occasion (string or null), notes (string or null).\n\n` +
      `Message:\n${text}`,
    { json: true, temperature: 0 },
  );
  return StoryBriefSchema.parse(normalizeBriefKeys(parseJsonObject(raw)));
}

export async function extractStoryBrief(text: string): Promise<StoryBrief> {
  try {
    const brief = await extractViaPioneer(text);
    logEvent("extract", "served by Pioneer GLiNER2", { brief });
    return brief;
  } catch (err) {
    logEvent("extract", "Pioneer unavailable, served by fallback LLM", {
      error: String(err),
    });
    return extractViaLlm(text);
  }
}
