import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

// Serves book assets (page JPGs, keepsake HTML) from data/orders/<bookId>/.
// Public: Linq downloads media parts from these URLs to deliver into iMessage.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ bookId: string; file: string }> },
) {
  const { bookId, file } = await ctx.params;
  if (bookId.includes("..") || file.includes("..") || file.includes("/")) {
    return NextResponse.json({ error: "bad path" }, { status: 400 });
  }
  const filePath = path.join(process.cwd(), "data", "orders", bookId, file);
  try {
    const data = await fs.readFile(filePath);
    const type = file.endsWith(".html")
      ? "text/html; charset=utf-8"
      : file.endsWith(".json")
        ? "application/json"
        : "image/jpeg";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
