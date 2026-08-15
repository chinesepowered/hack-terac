import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

// Records one A/B vote from a Terac participant (or anyone visiting /study).

const VOTES_PATH = path.join(process.cwd(), "data", "study-votes.json");

type Vote = {
  comparison: string;
  choice: "A" | "B";
  submissionId: string | null;
  ts: number;
};

async function readVotes(): Promise<Vote[]> {
  try {
    return JSON.parse(await fs.readFile(VOTES_PATH, "utf8"));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || (body.choice !== "A" && body.choice !== "B") || !body.comparison) {
    return NextResponse.json({ error: "bad vote" }, { status: 400 });
  }
  const votes = await readVotes();
  const submissionId = body.submissionId ? String(body.submissionId) : null;
  if (submissionId) {
    // One vote per participant per comparison — a retried or duplicate POST
    // replaces the earlier record instead of inflating the tally.
    const existing = votes.findIndex(
      (v) => v.submissionId === submissionId && v.comparison === body.comparison,
    );
    if (existing >= 0) votes.splice(existing, 1);
  }
  votes.push({
    comparison: String(body.comparison),
    choice: body.choice,
    submissionId,
    ts: Date.now(),
  });
  await fs.mkdir(path.dirname(VOTES_PATH), { recursive: true });
  await fs.writeFile(VOTES_PATH, JSON.stringify(votes, null, 2));
  logEvent("order", `study vote: ${body.comparison} → ${body.choice}`, {
    total: votes.length,
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const votes = await readVotes();
  const tallyOf = (vs: Vote[]) => {
    const t: Record<string, { A: number; B: number }> = {};
    for (const v of vs) {
      t[v.comparison] ??= { A: 0, B: 0 };
      t[v.comparison][v.choice] += 1;
    }
    return t;
  };
  // Terac participants carry a submissionId; anonymous votes (QA crawlers,
  // curious judges) are tallied separately and never steer the product.
  const verified = votes.filter((v) => v.submissionId);
  const anonymous = votes.filter((v) => !v.submissionId);
  return NextResponse.json({
    total: votes.length,
    verified: { votes: verified.length, tally: tallyOf(verified) },
    anonymous: { votes: anonymous.length, tally: tallyOf(anonymous) },
  });
}
