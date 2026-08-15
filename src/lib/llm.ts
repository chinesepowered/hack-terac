import OpenAI from "openai";
import { logEvent } from "./log";

// Every LLM call goes through here. Roles resolve <ROLE>_BASE_URL / _MODEL /
// _API_KEY from env and fall back to the generic LLM_* slot, so switching
// providers is an .env edit, never a code change.

export type LlmRole = "story" | "extractor";

type LlmConfig = { baseURL: string; apiKey: string; model: string };

function resolveConfig(role: LlmRole): LlmConfig {
  const prefix = role.toUpperCase();
  const baseURL =
    process.env[`${prefix}_BASE_URL`] || process.env.LLM_BASE_URL;
  const apiKey = process.env[`${prefix}_API_KEY`] || process.env.LLM_API_KEY;
  const model = process.env[`${prefix}_MODEL`] || process.env.LLM_MODEL;
  if (!baseURL || !apiKey || !model) {
    throw new Error(
      `LLM config missing for role "${role}": set ${prefix}_* or LLM_* in .env`,
    );
  }
  return { baseURL, apiKey, model };
}

function genericConfig(): LlmConfig | null {
  const { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL } = process.env;
  if (!LLM_BASE_URL || !LLM_API_KEY || !LLM_MODEL) return null;
  return { baseURL: LLM_BASE_URL, apiKey: LLM_API_KEY, model: LLM_MODEL };
}

export type ChatOptions = {
  system?: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
};

async function chatWith(
  config: LlmConfig,
  prompt: string,
  opts: ChatOptions,
): Promise<string> {
  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });
  const res = await client.chat.completions.create({
    model: config.model,
    messages: [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      { role: "user" as const, content: prompt },
    ],
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature,
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty response");
  return content;
}

export async function chat(
  role: LlmRole,
  prompt: string,
  opts: ChatOptions = {},
): Promise<string> {
  const primary = resolveConfig(role);
  try {
    const out = await chatWith(primary, prompt, opts);
    logEvent("llm", `${role} served by ${primary.model}`, {
      baseURL: primary.baseURL,
    });
    return out;
  } catch (err) {
    const fallback = genericConfig();
    const primaryFailed = `${role} primary (${primary.model}) failed`;
    if (!fallback || fallback.baseURL === primary.baseURL) {
      logEvent("error", primaryFailed, { error: String(err) });
      throw err;
    }
    logEvent("error", `${primaryFailed}, falling back to ${fallback.model}`, {
      error: String(err),
    });
    const out = await chatWith(fallback, prompt, opts);
    logEvent("llm", `${role} served by fallback ${fallback.model}`, {
      baseURL: fallback.baseURL,
    });
    return out;
  }
}
