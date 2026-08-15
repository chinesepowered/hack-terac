import fs from "node:fs/promises";
import path from "node:path";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { Book } from "@/lib/story";

// Books gain repainted pages after publish — never cache this page.
export const dynamic = "force-dynamic";

// The bedside reading page: the customer's book, read by lamplight.
// Also the Replay QA target — real user flow: read, then keep the book.

async function loadBook(bookId: string): Promise<Book | null> {
  if (bookId.includes("..") || bookId.includes("/")) return null;
  try {
    const raw = await fs.readFile(
      path.join(process.cwd(), "data", "orders", bookId, "book.json"),
      "utf8",
    );
    return JSON.parse(raw) as Book;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  props: PageProps<"/book/[bookId]">,
): Promise<Metadata> {
  const { bookId } = await props.params;
  const book = await loadBook(bookId);
  return { title: book ? `${book.title} · StoryLine` : "StoryLine" };
}

export default async function BookPage(props: PageProps<"/book/[bookId]">) {
  const { bookId } = await props.params;
  const searchParams = await props.searchParams;
  const book = await loadBook(bookId);
  if (!book) notFound();
  const paid = searchParams?.paid === "1";

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      {paid && (
        <p
          className="mb-6 rounded-lg px-4 py-3 text-center text-sm"
          style={{ background: "var(--dusk-2)", color: "var(--leaf)" }}
        >
          It&apos;s yours forever. The keepsake edition is on its way to your
          messages. 💛
        </p>
      )}

      <header className="text-center">
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: "var(--moon-dim)" }}
        >
          A StoryLine original
        </p>
        <h1 className="display mt-2 text-4xl leading-tight">{book.title}</h1>
        <p className="mt-2 text-sm italic" style={{ color: "var(--moon-dim)" }}>
          made just for {book.brief.heroName}
        </p>
      </header>

      <section className="page-card mx-auto mt-8 max-w-md p-6">
        <Image
          src={`/api/books/${book.id}/character.jpg`}
          alt={book.brief.heroName}
          width={1024}
          height={1024}
          sizes="(max-width: 520px) 86vw, 400px"
          className="h-auto w-full rounded"
          priority
        />
      </section>

      <div className="mt-10 space-y-10">
        {book.pages.map((page) => (
          <section key={page.pageNumber} className="page-card p-6 sm:p-8">
            <Image
              src={`/api/books/${book.id}/${path.basename(page.imagePath)}`}
              alt={`Illustration for page ${page.pageNumber}`}
              width={1024}
              height={1024}
              sizes="(max-width: 700px) 88vw, 608px"
              className="h-auto w-full rounded"
            />
            <p
              className="display mt-5 text-lg leading-relaxed sm:text-xl"
              style={{ color: "var(--ink)" }}
            >
              {page.text}
            </p>
            <p
              className="mt-4 text-center text-xs"
              style={{ color: "var(--ink)", opacity: 0.4 }}
            >
              {page.pageNumber}
            </p>
          </section>
        ))}
      </div>

      <footer className="mt-12 text-center text-sm" style={{ color: "var(--moon-dim)" }}>
        <p>
          Written &amp; painted tonight by the StoryLine studio.
        </p>
        <p className="mt-1">
          Want one for your kiddo? Text{" "}
          <span style={{ color: "var(--lamp)" }}>+1 (424) 394-5422</span>
        </p>
      </footer>
    </main>
  );
}
