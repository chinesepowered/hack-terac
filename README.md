# 📖 StoryLine — the storybook studio that lives in your Messages

**Text `+1 (424) 394-5422` and your kid becomes the hero of a hand-painted storybook — written, illustrated, sold, and delivered by AI agents, entirely inside iMessage.** 💙

No app. No signup. No human employees. A parent rambles about their kid; minutes later, watercolor pages are streaming into the thread.

---

## ✨ Watch it happen

1. 💬 **A parent texts the studio** — *"my daughter Maya is 4, obsessed with excavators, does everything with our cat Biscuit…"*
2. 🧠 **Agents extract the brief** — GLiNER2 on Pioneer pulls out the hero, sidekicks, and occasion (with an open-weight LLM fallback so the studio never stalls)
3. ✍️ **The story is written, 🎨 the hero is painted** — a character sheet locks the kid's look, then FLUX.2 paints every page *conditioned on that sheet* — same curls, same boots, every single page
4. 📲 **Pages stream into the thread as they dry** — real iMessage media, arriving one by one like the studio is painting live (because it is)
5. 👎 **Tapbacks are the UI** — thumbs-down any page and the studio repaints it; ❤️ approves. No app, no buttons — reactions *are* the product interface
6. 💳 **Checkout in the thread** — $5 keepsake edition via payment link (Linq Agent Pay → Apple Pay when connected), confirmed with a confetti screen effect 🎉
7. 🖨️ **The keepsake ships instantly** — a print-ready edition; every order's masterfile lives in its own **paused Superserve VM**, resumable for reprints and repaints forever

**This whole loop ran live during the hackathon** — real iMessage, real webhook-verified payment, real thank-you confetti. Watch the company work at the ops dashboard: job rail, press log, revenue meter. 🌙

---

## 🤖 A company, not a demo

- **The agents run everything**: intake, writing, illustration, art direction (via your tapbacks), fulfillment, payments, and customer delight
- **Vendors can fail; the company doesn't.** Every provider has a live fallback — Pioneer → DeepSeek extraction, Together → secondary image slot, Agent Pay → Stripe Checkout — with the serving path logged on the dashboard
- **Unit economics that actually work**: ~$0.25 of inference per book against a $5 price → **~95% gross margin** 📈. Personalized kids' books are a proven eight-figure market (Wonderbly) — ours has zero marginal labor and lives in the channel parents already use all day

## 🏆 Sponsor stack (all load-bearing)

| | |
|---|---|
| 💬 **Linq** | Real iMessage number; media-part page delivery; **tapback webhooks as the product's UI**; screen effects; payment requests; email-handle customers supported |
| 📦 **Superserve** | One VM per order — fulfillment integrity checks + archive run inside, then **paused with full state** until the order needs it again |
| 🧪 **Terac** | Two live gen-pop waves, verified participants: **86% preferred flat-vector** (studio default changed) and **71% preferred plain openings** (story prompt updated). Anonymous/bot traffic voted 7–0 the *opposite* way on style — submission-ID attribution kept the data honest, or the conclusion would have flipped |
| 🐛 **Replay** | 16 filings → 11 distinct findings → **10 confirmed correct & fixed, 1 false positive reported** — including a real data-corruption catch. Full finding-by-finding audit: [`REPLAY.md`](./REPLAY.md) |
| 🧠 **Pioneer** | GLiNER2 entity extraction with timeout + graceful open-weight fallback |
| 🎨 **W&B + Together** | DeepSeek-V4-Flash writes; FLUX.2-pro paints with reference-image character consistency |

## 🚀 Run it

```bash
pnpm install
cp .env.example .env        # fill in provider keys
pnpm build && pnpm start    # production server on :3000
cloudflared tunnel --url http://localhost:3000
pnpm exec tsx --env-file=.env scripts/linq-subscribe.ts   # point Linq at your tunnel
```

Then text the number. 📱 Pitch deck: open **`slides.html`**. Judge-friendly stops: `/` (ops dashboard) · `/book/<id>` (a finished book) · `/study` (the Terac A/B page).
