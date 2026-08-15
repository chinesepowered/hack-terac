import fs from "node:fs/promises";
import path from "node:path";
import type { Book } from "./story";

// Standalone keepsake edition: a single self-contained HTML file with every
// illustration embedded as a data URI. Print-styled (one page per sheet) so
// "print to PDF" produces the physical book. This is the paid deliverable.

export async function renderKeepsakeHtml(book: Book): Promise<string> {
  const pages: string[] = [];
  for (const page of book.pages) {
    const img = await fs.readFile(page.imagePath);
    pages.push(`
    <section class="page">
      <div class="art"><img src="data:image/jpeg;base64,${img.toString("base64")}" alt="Page ${page.pageNumber}"></div>
      <p class="story">${escapeHtml(page.text)}</p>
      <div class="folio">${page.pageNumber}</div>
    </section>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(book.title)}</title>
<style>
  :root { --ink: #3d3229; --paper: #faf6ee; --accent: #b5651d; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #e9e2d5; color: var(--ink); font-family: Georgia, 'Times New Roman', serif; }
  .page { background: var(--paper); max-width: 700px; margin: 2rem auto; padding: 3rem 3rem 2.5rem;
          box-shadow: 0 2px 24px rgba(61,50,41,.18); border-radius: 4px; position: relative; }
  .cover { text-align: center; padding-top: 4rem; }
  .cover .art { margin-top: 2rem; }
  h1 { font-size: 2.2rem; font-weight: normal; letter-spacing: .01em; line-height: 1.2; }
  .subtitle { margin-top: .8rem; font-style: italic; opacity: .75; }
  .art img { width: 100%; border-radius: 3px; display: block; }
  .story { margin-top: 1.6rem; font-size: 1.22rem; line-height: 1.65; }
  .folio { position: absolute; bottom: 1rem; left: 0; right: 0; text-align: center;
           font-size: .85rem; opacity: .45; }
  .colophon { text-align: center; font-size: .9rem; opacity: .6; padding: 2rem 0 3rem; }
  @media print {
    body { background: none; }
    .page { box-shadow: none; margin: 0 auto; page-break-after: always; max-width: none; }
    .colophon { display: none; }
  }
</style>
</head>
<body>
  <section class="page cover">
    <h1>${escapeHtml(book.title)}</h1>
    <p class="subtitle">A story made just for ${escapeHtml(book.brief.heroName)}</p>
    <div class="art"><img src="data:image/jpeg;base64,${(await fs.readFile(book.characterSheetPath)).toString("base64")}" alt="${escapeHtml(book.brief.heroName)}"></div>
  </section>
  ${pages.join("\n")}
  <p class="colophon">Written &amp; painted by the StoryLine studio · storyline.txt me at +1 (424) 394-5422</p>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function writeKeepsake(book: Book): Promise<string> {
  const html = await renderKeepsakeHtml(book);
  const outPath = path.join(book.dir, "book.html");
  await fs.writeFile(outPath, html);
  return outPath;
}
