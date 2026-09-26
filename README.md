# Arkzen

**Find opportunities worth pursuing — and help the operator turn them into customers.**

Arkzen is an AI-assisted lead/opportunity acquisition workbench. It is not a
scraper, not a CRM, and not an autonomous sales agent. It watches public
sources for people who are already saying what they need, filters out the
noise, explains *why* a signal is worth pursuing, and then helps a human work
that opportunity through to an outcome.

The human stays in control. AI is the operator's partner, not an automatic
salesperson.

```text
DISCOVER → FILTER → SCORE → RESEARCH → QUALIFY → STRATEGIZE → ENGAGE → CLOSE → OUTCOME
```

## Demo

> Interactive terminal demo — [view the full case study](https://emmanuelzyronis.vercel.app/work/arkzen)

```text
$ node dist/scanner.js --source hn --limit 5

ArkZen — lead acquisition workbench

Signal: HN thread "Ask HN: Who is hiring?" (posted 4h ago)
  Fit:          0.91  ✓  (TypeScript, backend, AI)
  Intent:       0.95  ✓  (explicit hiring signal)
  Urgency:      0.72  ✓  (recency)
  Reachability: 0.88  ✓  (profile has email)
  Score: 87/100 — PURSUE

  Evidence:   "Looking for senior backend engineer, TypeScript + AI experience"
  Inference:  Remote-friendly — no location constraint stated
  Unknown:    Budget, team size, equity structure

  → Staged for outreach review
```

## The workflow

1. **Discover** — source adapters pull candidate signals from public sources.
2. **Filter & dedupe** — cheap lexical/noise filtering removes spam, self-promo
   and non-asks before anything expensive runs.
3. **Score** — every opportunity gets an explainable 0–100 score built from
   named checks (fit, intent, urgency, reachability), each marked
   `pass` / `warn` / `unknown`.
4. **Research** — context is split honestly into **evidence** (observed),
   **inference**, and **unknown**. Arkzen never pretends to know something it
   doesn't.
5. **Qualify** — why it qualifies, plus risks and unknowns.
6. **Strategize** — how to approach, what to lead with, likely objections and
   the recommended response.
7. **Engage** — an AI deal partner grounded in *this* opportunity answers
   "what should I do next?", drafts openings, and interprets prospect replies.
   The operator can accept, edit, reject or override — nothing is ever sent
   automatically.
8. **Close & record outcome** — status, activity timeline and outcome are
   persisted so the opportunity can be picked up again later.

## Screens

Navigation is a persistent left sidebar — its panel and the content column
float on a grey canvas — and it collapses into a drawer below 1024px.

| Route | What it is |
| --- | --- |
| `/` | Overview — the KPI row, the ranked "where leads come from" panel, and the charts for what was found, what got a reply and how leads move |
| `/opportunities` | Every lead, as a sortable ranked table or a spreadsheet |
| `/opportunities/worth-pursuing` | The same table, filtered to the leads scored high enough to be worth your time |
| `/opportunities/in-progress` | …to the ones you have started working (`ACTIVE`) |
| `/opportunities/done` | …to the ones that ended, won or lost |
| `/opportunities/[id]` | One lead — why it scored what it did, the evidence behind it, how to approach it, the AI partner thread, and the activity timeline |
| `/assistant` | Every lead you have asked the AI partner about, with the threads |
| `/sources` | Which places are actually producing good leads |
| `/categories` | What people are asking for, grouped |
| `/insights` | The windowed aggregate report — score distribution and search history |
| `/help` | What Arkzen does, and what the words on these screens mean |
| `/settings` | The profile behind every score, and how the app looks |

The presentation layer is a reproduction of a supplied dashboard design; the
element-by-element map from that reference onto these screens, and every place
the build deviates from it and why, live in **`docs/REDESIGN.md`**.

## Design system

Built on tokens, not a component kit: **Tailwind 4 is CSS-first** — there is no
`tailwind.config.ts`, and `app/globals.css` declares the palette as custom
properties that `@theme inline` exposes as utilities (`bg-surface`,
`text-fg-muted`, `border-line`, `rounded-card`, `shadow-panel`, …).

- **Colour** — a near-neutral base and exactly one saturated accent,
  `--brand` green (`#16a34a` light / `#22c55e` dark). Green means "this number
  is good" or "this is the series you're reading"; nothing else gets to be
  colourful, and the chart series palette is the sole exception.
- **Type** — Geist Sans throughout, Geist Mono only for the spreadsheet's
  column letters and row gutter. The scale runs 34px display figures → 11px
  labels and is not extended. Every figure that can change is
  `tabular-nums`, so numbers don't jitter as they update.
- **Surfaces** — cards are separated by hairline borders and a soft panel
  shadow, on a grey canvas that is never white. The dark hero panel inside the
  light page carries its own foreground tokens and stays dark in both themes.
- **Copy** — plain language everywhere, including failure. No internal
  identifier reaches a screen: `lib/plain.ts` turns provider ids, run problems,
  statuses and matcher vocabulary into sentences first, and
  `tests/plain.test.ts` fails if a rule is added to the profile without one.

## Architecture

One Next.js application. The App Router is the product; there is no separate
backend service.

```text
lib/domain/     scoring, qualification, research, strategy, pipeline, partner reasoning
lib/sources/    SourceAdapter contract + adapters (Reddit live, reviewed corpus)
lib/data/       one async SQL driver with two backends + repository
lib/ai/         provider config (Azure OpenAI / OpenAI-compatible) + JSON completion
lib/plain.ts    the display layer's vocabulary — ids and enums to sentences
app/            routes, server components, API route handlers
components/     shell, screens, charts and the UI primitives
```

- **Persistence** — SQLite (`better-sqlite3`) locally and in tests; Postgres
  (`pg`) in deployment when `DATABASE_URL` is set. Nothing above
  `lib/data/driver.ts` knows which is active.
- **Source abstraction** — a source implements
  `search(profile, limit)`, `health()` and `capabilities()`. Adding a source is
  a new adapter plus one line in `lib/sources/index.ts`; the rest of Arkzen does
  not change.
- **Provider abstraction** — `lib/ai/provider.ts` reads provider config from the
  environment. If no key is configured, or the provider is unavailable, the AI
  partner falls back to a deterministic, grounded reasoning engine and says so
  in the UI. The interface is identical either way.

### What was retained from the previous (Twitter/FastAPI) prototype

- The domain vocabulary: watch profiles, evidence, qualification, opportunities,
  outcomes, append-only history.
- The acquisition provider boundary and "never hide a provider failure behind an
  empty result" rule — a blocked run reports `ACCESS_RESTRICTED`, not zero.
- Explainability discipline: every score and recommendation is grounded in
  evidence the operator can inspect.

### What was removed

- `twscrape`, Twitter/X account pools and X-specific monitoring assumptions.
- The FastAPI service and CLI-first operator workflow — Next.js route handlers
  now own the API surface.
- Regex dressed up as intelligence, and speculative ML/infrastructure.

The old Python implementation is archived under `legacy/` for reference only.
Nothing in the running app imports it.

## Sources

- **Reddit** — a real adapter exists and is registered. In this environment
  Reddit returns `403`, and the adapter **respects that**: it backs off, reports
  `ACCESS_RESTRICTED`, and never retries-to-evade access controls. The Overview
  says so in plain words rather than quietly showing a thin page.
- **Reviewed corpus** — because live ingestion is blocked here, `data/corpus.ts`
  holds sixteen hand-reviewed public posts, replayed through the *identical*
  pipeline (filter, dedupe, score, qualify — nothing is special-cased
  downstream). Eleven clear the filter and appear as opportunities. It is
  labelled **demo data** throughout the UI.

Swapping in live data later is a configuration change, not a rewrite.

## AI partner

- Live when `AZURE_OPENAI_*` or `OPENAI_API_KEY` is configured — answers are
  generated by the configured model and labelled `provider-backed`.
- Deterministic fallback otherwise (or if the model call fails, which is
  surfaced as a visible note). Answers remain grounded in the opportunity's
  evidence, scores, qualification, strategy and activity history.

The partner never sends anything. Accepting a draft means *you* send it from
your own account; that decision is logged on the timeline.

**One thing the UI must not pretend.** `payload` is a frozen snapshot written
at capture time, so a lead's score, research, strategy and suggested message
never change after it is captured — only its status, outcome, notes and partner
thread are live. Changing anything in `lib/domain/` therefore has no effect on
rows already in the database until it is reseeded. Screens are built not to
offer affordances that imply a re-score.

## Local development

```bash
npm install
npm run dev                 # http://localhost:3000 (SQLite at data/arkzen.sqlite3)
```

Optional environment (see `.env.example`):

```bash
DATABASE_URL=postgres://...            # use Postgres instead of SQLite
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://.../
AZURE_OPENAI_DEPLOYMENT=gpt-5-mini
AZURE_OPENAI_API_VERSION=2024-10-21
# or:
OPENAI_API_KEY=...  OPENAI_MODEL=gpt-4o-mini
```

To pick up a change to `lib/domain/`, delete the database and **restart the
server** — the glob must cover the sidecars, since the write-ahead log holds
essentially all the data and a running process keeps the deleted file open:

```bash
rm -f data/arkzen.sqlite3*
```

## Tests & verification

```bash
npm run typecheck     # tsc --noEmit
npm test              # vitest — 126 tests across 12 files
npm run build         # typecheck, then a production build
```

Tests cover scoring and qualification, text and money extraction, dedupe and
noise rejection, freshness, the windowing helpers, the plain-language labels,
repository persistence, the API routes and the assistant's conversation
grouping. They run on **both** SQL drivers — the Postgres path is the one that
deploys, so it is exercised rather than assumed:

```bash
DATABASE_URL=postgres://... npx vitest run
```

**Browser verification.** `scripts/verify.mjs` walks the app in a real browser
and is usable as a gate — it exits non-zero on any overflow, console error or
failed request:

```bash
node scripts/verify.mjs                                              # dev server on :3210
VERIFY_BASE=https://arkzen.vercel.app node scripts/verify.mjs        # the deployment
```

It visits every route at 1440 and 390 px in both themes, asserting
`documentElement.scrollWidth === clientWidth` at each; then opens a lead and
round-trips a note through the API to prove the write path persists across a
reload; then asks the AI partner a typed question and checks that both the
question and its answer survive one. Screenshots land in `$VERIFY_SHOTS`
(default `/tmp/arkzen-shots`) rather than the repo root.

## Deployment

Deployed on Vercel as a single Next.js project with a Neon Postgres database
provisioned through the Vercel Marketplace. `DATABASE_URL` is set in the
project for all environments; the AI provider variables are optional and the
app degrades to deterministic reasoning without them.

```bash
npx vercel deploy --prod
```

Two things worth knowing about the deployed project:

- **Per-deployment URLs sit behind Vercel SSO.** The production alias,
  <https://arkzen.vercel.app>, serves publicly.
- **Nothing in front of the app authenticates anyone.** The write endpoints —
  activities, status, outcome, partner and partner decisions — are open, so
  anyone who has the URL can change the corpus. Fine for a demo on a link you
  control; not fine to leave as-is if this becomes something real.

## Product boundaries

Arkzen is opportunity **intelligence and pursuit assistance**. It is not a
generic CRM, an email automation tool, an autonomous sales agent, a social
media scraper or a general chatbot.
