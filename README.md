# 📖 StoryLine — the storybook studio that lives in your Messages

**Text `+1 (424) 394-5422` and your kid becomes the hero of a hand-painted storybook — written, illustrated, sold, and delivered by AI agents, entirely inside iMessage.** 💙

No app. No signup. No human employees. A parent rambles about their kid; minutes later, illustrated pages are streaming into the thread.

**Proven on strangers:** during the hackathon, two organic customers texted the number and were served end-to-end — brief → book → in-thread checkout → fulfillment — with zero human involvement. One 👎'd a page, got it repainted in under a minute, and ❤️'d the result.

---

## ✨ Watch it happen

1. 💬 **A parent texts the studio** — *"my daughter Maya is 4, obsessed with excavators, does everything with our cat Biscuit…"*
2. 🧠 **Agents extract the brief** — hero, age, sidekicks, occasion — via open-weight GLiNER2 on Pioneer
3. ✍️ **The story is written, 🎨 the hero is painted** — a character sheet locks the kid's look, and every page is generated *conditioned on that sheet*: same curls, same boots, every single page
4. 📲 **Pages stream into the thread as they dry** — real iMessage media, arriving one by one like the studio is painting live (because it is)
5. 👎 **Tapbacks are the UI** — thumbs-down any page and the studio repaints it; ❤️ approves. Reactions *are* the product interface
6. 💳 **Checkout in the thread** — $5 keepsake edition, confirmed with a confetti screen effect 🎉
7. 🖨️ **The keepsake ships instantly** — a print-ready edition, with every order's masterfile preserved in its own paused Superserve VM

## 🤖 A company, not a demo

- **The agents run everything**: intake, writing, illustration, art direction (via customer tapbacks), fulfillment, payments, and customer delight — watch it live on the ops dashboard (job rail, press log, revenue meter)
- **It survives its vendors**: every external dependency degrades gracefully, and the dashboard logs which path served each request — the studio never stalls mid-order
- **Unit economics that actually work**: ~$0.25 of inference per book against a $5 price → **~95% gross margin** 📈, zero marginal labor, in a channel parents already live in. Personalized kids' books are a proven eight-figure market (Wonderbly)

---

# 🏆 Sponsor tracks — how we used each one

| Sponsor | At a glance |
|---|---|
| 💬 **Linq** | The storefront itself: real iMessage number, pages streamed as media, **tapbacks as the product UI** (👎 = repaint), screen effects, HMAC webhooks, Agent Pay wired — two strangers became customers by texting it |
| 📦 **Superserve** | One VM per order as fulfillment architecture: masterfile built and integrity-checked inside, then **paused with full state** for future reprints — ran on every real order |
| 🧪 **Terac** | Two verified gen-pop waves that **changed the product twice** (86% → vector default, 71% → plainer openings), with bot votes quarantined by submission tracking |
| 🐛 **Replay** | Three explore→fix→verify rounds: **13 real bugs fixed** (incl. data corruption), final pass clean, per-finding correctness audit in [`REPLAY.md`](./REPLAY.md), 3 false positives reported |
| 🧠 **Pioneer** | Open-weight **GLiNER2 extracts every customer brief in production** — schema-driven NER on rambling parent texts, sub-second, verified on real customers |

## 💬 Linq — the product *is* an iMessage business

Linq isn't a notification channel here; it's the storefront, the factory window, and the checkout counter.

- **A real iMessage number is the entire business**: +1 (424) 394-5422. Two strangers became customers during the hackathon by doing nothing but texting it
- **Pages ship as media parts, streamed as they're painted** — the customer watches their book being made, message by message
- **Tapbacks are the product's UI**: a 👎 on any page fires a `reaction.added` webhook and the studio repaints that page; ❤️ triggers a thank-you. Art direction with zero app surface — verified live by a real customer
- **Screen effects as brand moments**: `happy_birthday`/`sparkles` on delivery, `confetti` on payment confirmation
- **Deep webhook integration**: Standard Webhooks HMAC verification, pinned payload version (`2026-02-03`), instant-ack with `webhook-id` deduplication that correctly honors Linq's retry semantics
- **Agent Pay ready**: `payment_requests` integration is wired for in-thread Apple Pay the moment the Stripe connect completes
- Works for **email-handle iMessage customers and phone numbers alike** — sender identity treated as opaque handles throughout

## 📦 Superserve — one paused VM per order is the fulfillment architecture

- Every order's masterfile (keepsake HTML + assets + metadata) is written into **its own Superserve sandbox**; integrity checks and archival run *inside the VM*
- The sandbox is then **paused with full state preserved** — Superserve's signature capability used as product architecture: reprints and repaints resume the exact same machine, forever
- This ran for **every real order**, including both organic customers — `fulfillment.json` in each order dir records the sandbox ID and integrity report
- Bonus: the whole company runs from an old MacBook Air — the heavy lifting lives in Superserve's cloud, not our hardware

## 🧪 Terac — human data that changed the product twice (and survived bot contamination)

- **Two recruited gen-pop waves** through the full opportunities API lifecycle: project → screening question → activity task pointing at our `/study` A/B page → launch (plus a stop-and-relaunch when our URL rotated — the whole lifecycle, programmatic)
- Participants compared a **matched illustration pair** (same scene, watercolor vs. vector) and two story openings, tracked per-participant via Terac's `submissionId` URL params with completion callbacks
- **The data shipped two product changes**: 86% of verified participants chose the vector style → it became the studio's default; 71% preferred plain openings → the story prompt was updated. Both changes are cited in the code
- **The attribution save**: anonymous traffic (including an autonomous QA crawler) voted **7–0 the opposite direction** of verified humans — without Terac submission tracking, our study's conclusion would have silently flipped. Verified and anonymous tallies are reported separately at `/api/study/vote`

## 🐛 Replay — three explore→fix→verify rounds to a clean report

- **21 filings → 13 real bugs found and fixed**, spanning build config (dev React served to users), performance (polling cadence, image sizing, a request waterfall), **real data corruption** (an API field returning `[object Object]`), and UX robustness (votes silently lost on failed saves)
- **Final verification pass: clean — zero findings** on the production build
- **[`REPLAY.md`](./REPLAY.md)**: a finding-by-finding correctness audit answering "was the QA right?" — 13 of 14 distinct findings correct (93%), each with verdict, evidence, and fix
- **3 false positives identified and reported** (contrast complaints against Cloudflare's tunnel interstitial pages, not our app)
- Documented a novel hazard: the QA crawler *voted in our live Terac study* — caught and quarantined by attribution

## 🧠 Pioneer — an open-weight SLM does the core NLU in production

- **Every customer brief is extracted by GLiNER2** (`fastino/gliner2-large-v1`) on Pioneer's native `/inference` endpoint — schema-driven entity extraction (child name, age, interests, companions, occasion, setting) from rambling parent texts
- Not a demo path: **both organic customers' briefs were parsed by GLiNER2 live**, logged as `served by Pioneer GLiNER2` on the ops dashboard
- Sub-second, purpose-built extraction where a generalist LLM would be overkill — exactly what a small open-weight NER model is for

---

## 🚀 Run it

```bash
pnpm install
cp .env.example .env        # fill in provider keys
pnpm build && pnpm start    # production server on :3000
cloudflared tunnel --url http://localhost:3000
pnpm exec tsx --env-file=.env scripts/linq-subscribe.ts   # point Linq at your tunnel
```

Then text the number. 📱 Pitch deck: open **`slides.html`**. Judge-friendly stops: `/` (ops dashboard) · `/book/<id>` (a finished book) · `/study` (the Terac A/B page).

*Under the hood: FLUX.2-pro paints with reference-image character conditioning; DeepSeek-V4-Flash writes the stories.*
