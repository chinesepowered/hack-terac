import fs from "node:fs/promises";
import path from "node:path";
import { chat } from "./llm";
import { generateImage } from "./images";
import { logEvent } from "./log";
import { parseJsonObject, type StoryBrief } from "./extract";
import { z } from "zod";

// Book pipeline: brief → story JSON → character sheet → per-page illustrations
// conditioned on the character sheet (identity consistency). Every asset is
// cached to disk under data/orders/<id>/ so a provider hiccup mid-demo means
// re-serving a cached page, never a blank bubble.

// Default illustration style is data-driven: in the Terac gen-pop study
// (2026-08-15, 5 verified participants) flat vector beat watercolor 4–1.
// STORY_STYLE in .env overrides for special editions.
const STYLE =
  process.env.STORY_STYLE ||
  "flat modern vector children's book illustration, bold simple shapes, " +
    "bright saturated colors, minimal texture, friendly rounded forms, " +
    "unsigned, no signature, no watermark, absolutely no readable text or " +
    "lettering anywhere in the image";

const StoryJsonSchema = z.object({
  title: z.string(),
  characterDescription: z.string(),
  companionDescription: z.string().nullish(),
  pages: z
    .array(z.object({ text: z.string(), scene: z.string() }))
    .min(1),
});
export type StoryJson = z.infer<typeof StoryJsonSchema>;

export type BookPage = { pageNumber: number; text: string; imagePath: string };
export type Book = {
  id: string;
  dir: string;
  title: string;
  brief: StoryBrief;
  characterSheetPath: string;
  pages: BookPage[];
};

const ORDERS_DIR = path.join(process.cwd(), "data", "orders");

export async function writeStory(
  brief: StoryBrief,
  pageCount = 6,
): Promise<StoryJson> {
  const raw = await chat(
    "story",
    `You are the head writer at a personalized children's book studio. ` +
      `Write a bedtime story as JSON for this child:\n` +
      `${JSON.stringify(brief)}\n\n` +
      `Return JSON with exactly these keys:\n` +
      `- "title": a warm, playful title featuring the child's name\n` +
      `- "characterDescription": a stable visual description of the hero used ` +
      `on every illustration (age, hair, outfit with specific colors — invent ` +
      `charming specifics; keep it under 40 words)\n` +
      `- "companionDescription": a stable visual description of the child's ` +
      `companion(s) — species, coloring, size (e.g. "Biscuit, a plump orange ` +
      `tabby cat with white paws"); null if the story has no companion\n` +
      `- "pages": array of exactly ${pageCount} objects, each with:\n` +
      `  - "text": 2-4 sentences of story, read-aloud rhythm, age-appropriate\n` +
      `  - "scene": what the illustration shows — setting, action, mood. ` +
      `Every fact in the scene must match the page text. Never repeat ` +
      `character appearances here. Scenes must contain no readable text: ` +
      `banners, signs, and books shown are blank or pattern-only.\n\n` +
      `The story should weave in the child's interests and companions, build ` +
      `gently to a small brave moment, and land softly for bedtime. Open ` +
      `simply and concretely — in testing, parents preferred plain, direct ` +
      `openings over ornate ones 5–2.\n\n` +
      `Trademarked characters (Pokémon, Disney, superheroes, branded toys): ` +
      `never name or depict them in characterDescription, ` +
      `companionDescription, or any scene — illustrations get rejected. ` +
      `Invent an original creature with similar charm instead: its own name, ` +
      `its own look, clearly not the branded character.`,
    { json: true, temperature: 0.8 },
  );
  return StoryJsonSchema.parse(parseJsonObject(raw));
}

function castDescription(story: StoryJson): string {
  return (
    story.characterDescription +
    (story.companionDescription
      ? ` Always alongside: ${story.companionDescription}.`
      : "")
  );
}

// BFL moderation probabilistically rejects image-conditioned prompts that
// mention a child's age ("4-year-old" + reference image). Ages are stripped
// from every image prompt proactively; on a moderation rejection we retry once
// with an extra wholesome framing suffix.
function stripAges(prompt: string): string {
  return prompt.replace(/\b\d+\s*-?\s*year-?\s*old\b/gi, "young");
}

async function generateSafely(
  prompt: string,
  referenceImages?: Buffer[],
): Promise<Buffer> {
  const safePrompt = stripAges(prompt);
  try {
    return await generateImage({ prompt: safePrompt, referenceImages });
  } catch (err) {
    logEvent("error", "generation rejected, retrying with softened prompt", {
      error: String(err).slice(0, 200),
    });
    try {
      return await generateImage({
        prompt:
          safePrompt +
          " Wholesome, innocent children's picture-book illustration.",
        referenceImages,
      });
    } catch (err2) {
      // Usually a trademarked character (moderation rejects IP, e.g. Pikachu).
      logEvent("error", "still rejected — rewriting prompt to remove IP", {
        error: String(err2).slice(0, 150),
      });
      const rewritten = await chat(
        "extractor",
        `This children's-book illustration prompt was rejected by an image ` +
          `model's content moderation — most often because it names a ` +
          `trademarked character (Pokémon, Disney, superheroes) or branded ` +
          `toy. Rewrite it as a fully original prompt: replace any ` +
          `trademarked character with an invented creature of similar charm ` +
          `(different name, different look), keep the scene's emotional ` +
          `moment, the human characters' descriptions, and the art style ` +
          `unchanged. Return ONLY the rewritten prompt text.\n\n` +
          `Prompt:\n${safePrompt}`,
        { temperature: 0.4 },
      );
      return generateImage({ prompt: rewritten.trim(), referenceImages });
    }
  }
}

async function saveImage(dir: string, name: string, img: Buffer) {
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, img);
  return filePath;
}

export async function createBook(
  brief: StoryBrief,
  opts: { pageCount?: number; onPage?: (page: BookPage) => Promise<void> } = {},
): Promise<Book> {
  const id = `${brief.heroName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
  const dir = path.join(ORDERS_DIR, id);
  await fs.mkdir(dir, { recursive: true });

  const story = await writeStory(brief, opts.pageCount ?? 6);
  await fs.writeFile(path.join(dir, "story.json"), JSON.stringify(story, null, 2));
  await fs.writeFile(path.join(dir, "brief.json"), JSON.stringify(brief, null, 2));
  logEvent("order", `story written: "${story.title}"`, { id });

  const cast = castDescription(story);
  const sheetImg = await generateSafely(
    `Character sheet: full-body portrait of ${cast} Standing, friendly ` +
      `expression, plain cream background, ${STYLE}`,
  );
  const characterSheetPath = await saveImage(dir, "character.jpg", sheetImg);
  logEvent("order", "character sheet generated", { id });

  const characterSheet = await fs.readFile(characterSheetPath);
  const pages: BookPage[] = [];
  for (const [i, page] of story.pages.entries()) {
    const img = await generateSafely(
      `Same characters as the reference image (${cast}). ` +
        `Scene: ${page.scene}. ${STYLE}`,
      [characterSheet],
    );
    const imagePath = await saveImage(dir, `page-${i + 1}.jpg`, img);
    const bookPage = { pageNumber: i + 1, text: page.text, imagePath };
    pages.push(bookPage);
    logEvent("order", `page ${i + 1}/${story.pages.length} illustrated`, { id });
    await opts.onPage?.(bookPage);
  }

  const book: Book = {
    id,
    dir,
    title: story.title,
    brief,
    characterSheetPath,
    pages,
  };
  await fs.writeFile(path.join(dir, "book.json"), JSON.stringify(book, null, 2));
  return book;
}
