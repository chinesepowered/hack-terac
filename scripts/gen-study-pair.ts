import fs from "node:fs/promises";
import { generateImage } from "../src/lib/images";

const SCENE =
  "a small girl feeding ducks at a sunny farm pond, her orange tabby cat " +
  "watching beside her, morning light, no readable text, unsigned, no watermark";

async function main() {
  const ref = await fs.readFile("data/orders/maya-1786826745946/character.jpg");
  // Sequential on purpose: Together enforces a requests-per-minute limit and
  // the live agent shares this account — never run image calls in parallel.
  const a = await generateImage({
    prompt: `Same characters as the reference image. Scene: ${SCENE}. Warm watercolor children's storybook illustration, soft edges, muted natural palette.`,
    referenceImages: [ref],
  });
  await new Promise((r) => setTimeout(r, 5000));
  const b = await generateImage({
    prompt: `Same characters as the reference image. Scene: ${SCENE}. Flat modern vector children's book illustration, bold simple shapes, bright saturated colors, minimal texture.`,
    referenceImages: [ref],
  });
  await fs.writeFile("public/study/style-a.jpg", a);
  await fs.writeFile("public/study/style-b.jpg", b);
  console.log("study pair written:", a.length, b.length, "bytes");
}
main().catch((e) => { console.error(e); process.exit(1); });
