import fs from "node:fs/promises";
import path from "node:path";
import { extractStoryBrief } from "./extract";
import { generateImage } from "./images";
import { createBook, type StoryJson } from "./story";
import { writeKeepsake } from "./bookHtml";
import { fulfillOrder } from "./superserve";
import {
  createPaymentRequest,
  sendPage,
  sendParts,
  sendText,
} from "./linq";
import { createCheckoutUrl } from "./stripe";
import { getOrCreateOrder, updateOrder, type Order } from "./store";
import { logEvent } from "./log";

// The StoryLine agent: turns an iMessage thread into a finished storybook.
// collecting → generating (pages stream into the thread as they're painted)
// → review (❤️ approves, 👎 on a page repaints it) → payment.

const PRICE_CENTS = 500;
const PAGE_COUNT = Number(process.env.STORY_PAGES || 6);

function publicBase(): string | null {
  return process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? null;
}

const WELCOME =
  "Hi! 👋 You've reached StoryLine — we turn your kiddo into the hero of " +
  "their very own illustrated storybook, right here in this chat.\n\n" +
  "Tell me about them: their name, age, what they love, any sidekicks " +
  "(pets, siblings, a favorite toy), and the occasion if there is one. " +
  "Ramble away — I'll catch the details. 🖍️";

export async function handleInboundMessage(
  chatId: string,
  senderHandle: string,
  text: string,
): Promise<void> {
  const order = await getOrCreateOrder(chatId, senderHandle);
  logEvent("order", `inbound from ${senderHandle}`, {
    orderId: order.id,
    status: order.status,
  });

  if (order.status === "generating") {
    await sendText(
      chatId,
      "The studio's mid-painting! 🎨 Pages keep arriving here as they dry.",
    );
    return;
  }

  if (order.status !== "collecting") {
    await sendText(
      chatId,
      "Want another book — a sibling, a friend's birthday? Tell me about " +
        "the next hero and I'll get the studio going again. 📚",
    );
    await updateOrder(chatId, { status: "collecting", inbox: [text] });
    return;
  }

  // updateOrder mutates the shared object — capture pre-update facts first.
  const isFirstContact = order.inbox.length === 0;
  const inbox = [...order.inbox, text];
  await updateOrder(chatId, { inbox });

  if (isFirstContact && text.length < 25) {
    // First contact was a bare greeting — introduce ourselves.
    await sendText(chatId, WELCOME);
    return;
  }

  const brief = await extractStoryBrief(inbox.join("\n")).catch((err) => {
    logEvent("error", "brief extraction failed", {
      error: String(err).slice(0, 300),
    });
    return null;
  });
  const ready =
    brief?.heroName &&
    (brief.interests.length > 0 || brief.companions.length > 0);

  if (!ready) {
    await sendText(
      chatId,
      brief?.heroName
        ? `${brief.heroName} — lovely name! What are they into these days? ` +
          `The more you tell me, the better the story. ✨`
        : isFirstContact
          ? WELCOME
          : `I want to get this just right — what's your kiddo's name, and ` +
            `what do they love? (Dinosaurs? A pet? Puddles?) 🖍️`,
    );
    return;
  }

  const bits = [
    ...brief.interests.slice(0, 2),
    ...brief.companions.slice(0, 1),
  ].join(", ");
  await sendText(
    chatId,
    `Got it — a story for ${brief.heroName}, starring ${bits}. 💫 Our ` +
      `studio is writing and painting it right now. Pages will appear here ` +
      `as they're finished — about a minute each.`,
  );
  await updateOrder(chatId, { status: "generating" });

  // Fire-and-forget: pages stream into the thread as they render.
  void generateAndDeliver(chatId, brief).catch(async (err) => {
    logEvent("error", "generation failed", { error: String(err).slice(0, 300) });
    await updateOrder(chatId, { status: "collecting" });
    await sendText(
      chatId,
      "Our easel wobbled mid-painting — give me a nudge and I'll start fresh. 🙏",
    );
  });
}

async function generateAndDeliver(
  chatId: string,
  brief: NonNullable<Awaited<ReturnType<typeof extractStoryBrief>>>,
) {
  const base = publicBase();
  const pageMessages: Record<string, number> = {};

  const book = await createBook(brief, {
    pageCount: PAGE_COUNT,
    onPage: async (page) => {
      const imageUrl = base
        ? `${base}/api/books/${bookIdOf(page.imagePath)}/${path.basename(page.imagePath)}`
        : null;
      const ids = imageUrl
        ? await sendPage(chatId, imageUrl, page.text)
        : await sendText(chatId, `📖 Page ${page.pageNumber}:\n${page.text}`);
      if (ids[0]) pageMessages[ids[0]] = page.pageNumber;
      await updateOrder(chatId, { pageMessages });
    },
  });

  await updateOrder(chatId, {
    bookId: book.id,
    bookTitle: book.title,
    status: "review",
  });

  const keepsakePath = await writeKeepsake(book);
  void fulfillOrder(book, keepsakePath);

  const isBirthday = (brief.occasion ?? "").toLowerCase().includes("birthday");
  const previewUrl = base ? `${base}/book/${book.id}` : null;
  await sendText(
    chatId,
    `That's "${book.title}"! 📖\n\n` +
      `❤️ this thread if you love it — 👎 any page and the studio repaints it.` +
      (previewUrl ? `\n\nRead it anytime: ${previewUrl}` : ""),
    isBirthday ? "happy_birthday" : "sparkles",
  );

  await sendPaymentAsk(chatId, book.id, book.title, brief.heroName);
}

async function sendPaymentAsk(
  chatId: string,
  bookId: string,
  title: string,
  heroName: string,
) {
  const base = publicBase();
  let url = await createPaymentRequest(PRICE_CENTS, `StoryLine: ${title}`, {
    chat_id: chatId,
    book_id: bookId,
  });
  if (!url) {
    url = await createCheckoutUrl({
      amountCents: PRICE_CENTS,
      productName: `StoryLine keepsake edition — ${title}`,
      successUrl: base ? `${base}/book/${bookId}?paid=1` : "https://example.com",
      metadata: { chat_id: chatId, book_id: bookId },
    });
  }
  await updateOrder(chatId, { paymentUrl: url, status: "payment_sent" });
  await sendText(
    chatId,
    url
      ? `Keep ${heroName}'s book forever — the keepsake edition (print-ready, ` +
        `theirs for good) is $5: ${url}`
      : `The keepsake edition is $5 — payment link is warming up, I'll send ` +
        `it in a moment. 🧾`,
  );
}

export async function handleReaction(
  chatId: string,
  senderHandle: string,
  reaction: string,
  messageId: string | null,
): Promise<void> {
  const order = await getOrCreateOrder(chatId, senderHandle);
  const kind = reaction.toLowerCase();
  logEvent("order", `reaction "${reaction}"`, { orderId: order.id, messageId });

  const pageNumber = messageId ? order.pageMessages[messageId] : undefined;

  if ((kind.includes("dislike") || kind.includes("thumbsdown") || kind === "👎") && pageNumber && order.bookId) {
    await sendText(chatId, `On it — repainting page ${pageNumber}. 🎨`);
    await repaintPage(chatId, order, pageNumber);
    return;
  }

  if (kind.includes("love") || kind.includes("like") || kind.includes("heart")) {
    if (order.status === "payment_sent" || order.status === "review") {
      await sendText(
        chatId,
        "So glad! 🥰 Tell a friend — every book is painted fresh for its hero.",
      );
    }
  }
}

async function repaintPage(chatId: string, order: Order, pageNumber: number) {
  const dir = path.join(process.cwd(), "data", "orders", order.bookId!);
  const story: StoryJson = JSON.parse(
    await fs.readFile(path.join(dir, "story.json"), "utf8"),
  );
  const page = story.pages[pageNumber - 1];
  if (!page) return;
  const characterSheet = await fs.readFile(path.join(dir, "character.jpg"));
  const cast =
    story.characterDescription +
    (story.companionDescription
      ? ` Always alongside: ${story.companionDescription}.`
      : "");
  const img = await generateImage({
    prompt:
      `Same characters as the reference image (${cast.replace(/\b\d+\s*-?\s*year-?\s*old\b/gi, "young")}). ` +
      `Scene: ${page.scene}. A fresh, different composition than before. ` +
      `Warm watercolor children's storybook illustration, soft edges, ` +
      `no readable text, unsigned, no watermark.`,
    referenceImages: [characterSheet],
  });
  const fileName = `page-${pageNumber}-v${Date.now() % 1000}.jpg`;
  await fs.writeFile(path.join(dir, fileName), img);

  const base = publicBase();
  const ids = base
    ? await sendPage(chatId, `${base}/api/books/${order.bookId}/${fileName}`, page.text)
    : await sendText(chatId, `Repainted page ${pageNumber} — fresh take! 🎨`);
  if (ids[0]) {
    order.pageMessages[ids[0]] = pageNumber;
    await updateOrder(chatId, { pageMessages: order.pageMessages });
  }
  logEvent("order", `page ${pageNumber} repainted`, { orderId: order.id });
}

function bookIdOf(imagePath: string): string {
  return path.basename(path.dirname(imagePath));
}
