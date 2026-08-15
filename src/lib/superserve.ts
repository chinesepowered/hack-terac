import fs from "node:fs/promises";
import path from "node:path";
import { logEvent } from "./log";
import type { Book } from "./story";

// Superserve fulfillment: every order gets its own persistent VM workspace.
// The book's masterfile (keepsake HTML + assets) is written into the sandbox,
// an integrity check + archive step runs there, and the sandbox is paused —
// full state preserved — until the order needs it again (repaints, reprints).
// Any failure falls back to local-only fulfillment so orders never block.

export type Fulfillment = {
  via: "superserve" | "local";
  sandboxId?: string;
  report?: unknown;
};

// POSIX shell only — the superserve/base image carries no python3.
const CHECK_SCRIPT = `
set -e
cd /work
printf '{"files":{'
first=1
for f in *; do
  [ -f "$f" ] || continue
  case "$f" in bundle.tar.gz|check.sh) continue;; esac
  size=$(wc -c < "$f" | tr -d ' ')
  sha=$(sha256sum "$f" | cut -c1-16)
  [ $first -eq 1 ] || printf ','
  first=0
  printf '"%s":{"bytes":%s,"sha256":"%s"}' "$f" "$size" "$sha"
done
tar -czf /tmp/bundle.tar.gz --exclude=check.sh .
mv /tmp/bundle.tar.gz /bundle.tar.gz
printf '},"bundle_bytes":%s}' "$(wc -c < /bundle.tar.gz | tr -d ' ')"
`;

export async function fulfillOrder(
  book: Book,
  keepsakePath: string,
): Promise<Fulfillment> {
  if (!process.env.SUPERSERVE_API_KEY) {
    logEvent("order", "fulfillment: SUPERSERVE_API_KEY unset, local only", {
      bookId: book.id,
    });
    return { via: "local" };
  }
  try {
    const { Sandbox } = await import("@superserve/sdk");
    const sandbox = await Sandbox.create({ name: `storyline-${book.id}` });
    try {
      await sandbox.commands.run("mkdir -p /work");
      await sandbox.files.write(
        "/work/book.html",
        await fs.readFile(keepsakePath, "utf8"),
      );
      await sandbox.files.write(
        "/work/book.json",
        JSON.stringify({ id: book.id, title: book.title, brief: book.brief }),
      );
      await sandbox.files.write("/work/check.sh", CHECK_SCRIPT);
      const result = await sandbox.commands.run("sh /work/check.sh");
      if (result.exitCode !== 0) {
        throw new Error(`check.sh exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
      }
      const report = JSON.parse(result.stdout.trim());
      await fs.writeFile(
        path.join(book.dir, "fulfillment.json"),
        JSON.stringify({ sandboxId: sandbox.id, report }, null, 2),
      );
      // Preserve full VM state between turns; resumed for repaints/reprints.
      await sandbox.pause();
      logEvent("order", "fulfilled in Superserve sandbox (paused)", {
        bookId: book.id,
        sandboxId: sandbox.id,
      });
      return { via: "superserve", sandboxId: sandbox.id, report };
    } catch (err) {
      await sandbox.kill().catch(() => {});
      throw err;
    }
  } catch (err) {
    logEvent("error", "Superserve fulfillment failed, falling back to local", {
      error: String(err).slice(0, 200),
    });
    return { via: "local" };
  }
}
