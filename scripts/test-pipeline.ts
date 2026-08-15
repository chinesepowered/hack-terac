// End-to-end pipeline test: brief extraction (expects Pioneer fallback while
// billing is inactive) → story → character sheet → pages.
// Run: node --env-file=.env scripts/test-pipeline.ts
import { extractStoryBrief } from "../src/lib/extract";
import { createBook } from "../src/lib/story";

const PARENT_MESSAGE =
  "hi! my daughter Maya is 4, she is completely obsessed with excavators and " +
  "diggers, and she does everything with our orange cat Biscuit. her birthday " +
  "is friday and we're going to grandma's farm";

async function main() {
  console.log("→ extracting brief…");
  const brief = await extractStoryBrief(PARENT_MESSAGE);
  console.log(JSON.stringify(brief, null, 2));

  console.log("→ creating book (3 pages for the test)…");
  const book = await createBook(brief, {
    pageCount: 3,
    onPage: async (p) => console.log(`  page ${p.pageNumber} → ${p.imagePath}`),
  });
  console.log(`✓ "${book.title}" → ${book.dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
