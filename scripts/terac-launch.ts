// Launches the StoryLine A/B study on Terac, sending participants to
// PUBLIC_BASE_URL/study. Costs real study budget — run deliberately.
// Run: pnpm exec tsx --env-file=.env scripts/terac-launch.ts [participants]

import { launchStudy } from "../src/lib/terac";

async function main() {
  const publicBase = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!publicBase) throw new Error("Set PUBLIC_BASE_URL in .env first");
  const participants = Number(process.argv[2] ?? 25);

  const study = await launchStudy({
    title: "Pick the better children's storybook (2 quick comparisons)",
    description:
      "Look at two versions of a children's storybook — an illustration pair " +
      "and an opening-line pair — and pick the one you'd rather read to a " +
      "child. Under 3 minutes.",
    taskUrl: `${publicBase}/study`,
    participants,
    durationMinutes: 3,
  });
  console.log("launched:", study);
  console.log("\nTally live at /api/study/vote (GET).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
