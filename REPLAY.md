# 🐛 Replay QA audit — was the QA correct?

Per the Replay judges' ask: an honest, finding-by-finding verdict on everything
Loop QA reported against StoryLine, with what we did about each one.

**How we ran it:** two projects. `StoryLine` targeted our first deployment;
after its findings were fixed we redeployed and continued in
`StoryLine (production)`, running explore → fix → verify cycles until the
final pass. Every bug carries a remediation note in the Replay dashboard.

## Scoreboard

- **21 filings** across both projects → **14 distinct findings** (the pipeline
  re-files a finding when a run that executed against a pre-fix build finishes
  processing after the fix; we attributed duplicates via `test_run_id`)
- **13 of 14 correct (93%)** — all fixed and verified on the current build
- **1 false-positive class, 3 filings** — WCAG contrast complaints about
  elements on *Cloudflare's* tunnel interstitial pages, reported to Replay
- A mid-audit verification pass ran **clean (5 journeys, zero findings)**;
  a later crawl during a ~60s deploy window produced one final batch
  (rows 12–14 below), fixed and re-verified

## Verdicts

| # | Finding | Verdict | What we did |
|---|---------|---------|-------------|
| 1 | Development build of React served to users | ✅ **Correct** — we were serving `next dev` through the tunnel | Production build: `next build` + `next start` |
| 2 | Unminified ~949KB client bundle shipped eagerly | ✅ Correct (same root cause as #1) | Fixed by #1's production build |
| 3 | 864KB `next-devtools` bundle shipped eagerly | ✅ Correct (same root cause as #1) | Fixed by #1's production build |
| 4 | Study "Pick A" buttons dead — client chunk 403 | ✅ Correct observation, transient cause: a mid-migration rebuild left stale chunks on the retired dev deployment | Deployment replaced; flow verified working by Replay's own later runs *and* 5 live Terac participants |
| 5 | Unconditional 2.5s polling → 17 identical GETs while idle (filed 2×) | ✅ **Correct** — fair catch on a lazy default | Adaptive polling: 2.5s only while an order is generating or events are fresh, 15s idle, paused when tab hidden |
| 6 | 1024×1024 JPEG into 80×80 thumbnails (filed 3×) | ✅ Correct | Thumbnails moved to `next/image` optimizer |
| 7 | 256px image into 80px box after the first fix (filed 2×) | ✅ Correct — caught that our "fix" over-provisioned (`width={160}`) | Corrected to `width={80}`: 96px at 1×, 256px only for 2× retina |
| 8 | 1024×1024 into ~328px box on the book page | ✅ Correct | Book illustrations moved to responsive `next/image` with `sizes` |
| 9 | Request waterfall: thumbnails wait 809ms behind `/api/orders` fetch | ✅ **Correct** — genuinely sharp architectural catch | Dashboard is now server-rendered with the initial snapshot; proofs paint on first byte |
| 10 | API returns `senderHandle: "[object Object]"` on a paid order | ✅ **Correct — best catch of the batch.** Real data corruption: live Linq webhooks send the sender as an object, and an earlier hot-patch was overwritten by a stale in-memory state flush | Webhook now normalizes the participant object to its `.handle`; stored order repaired; verified via `/api/orders` |
| 11 | Low-contrast text on "Working" / "Host" / "Browser" labels (3 filings) | ❌ **False positive** — every flagged element lives on **Cloudflare's tunnel status/error pages**, not StoryLine; the crawler read the interstitial as our app | Marked `invalid`; reported to Replay per their false-positive program |
| 12 | Cloudflare 502 when navigating to the book page | ✅ Correct observation, transient cause: the crawler hit a ~60s server rebuild window; the app serves 200 before and after | No code change; laptop-hosted deploys have restart gaps — noted |
| 13 | Vote silently lost when POST returns 502, no error shown | ✅ **Correct** — real robustness gap: the study page swallowed fetch failures and advanced anyway, discarding the participant's pick | Study flow no longer advances past an unsaved vote; failure shows a "tap again" alert |
| 14 | 8 duplicate vote POSTs recorded for 2 comparisons | ✅ Correct — the endpoint accepted duplicates | One vote per participant per comparison: a retried POST replaces the earlier record instead of inflating the tally |

## Notes for the judges

- **The "blocked" exploration was also useful.** One run blocked because the
  dashboard had no clickable route to the book or study pages — a pure display
  surface. That's QA friction, but it exposed a real navigation gap a human
  visitor would hit too; we added header links and ticket-title links.
- **Agentic QA meets a live experiment.** Replay's crawler faithfully
  "completed the study flow" — and thereby *cast votes into our live Terac
  A/B study*. Our vote records carry the Terac `submissionId`, so bot votes
  tally separately from verified human votes and never steered the product.
  This mattered more than we expected: anonymous traffic ultimately voted
  **7–0 the opposite direction** of verified humans on illustration style —
  without attribution, automated QA would have silently flipped our study's
  conclusion. Worth knowing before pointing an autonomous QA agent at
  anything holding a live experiment.
- **Severity calibration felt right.** Nothing was inflated to critical;
  performance findings came with concrete byte/timing measurements
  (809ms waterfall, 10,934 wasted bytes) that made verification easy.

**Bottom line:** 10 of 11 distinct findings were real — several were things we
would not have caught before judging (the dev-build serving and the
`[object Object]` data corruption especially). The one miss was an off-app
false positive. QA verdict: correct, and worth the cycles.
