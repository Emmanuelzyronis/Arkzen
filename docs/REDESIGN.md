# Arkzen redesign — Skymetrics parity

**Decision (2026-09-11):** rebuild the whole presentation layer as a faithful
reproduction of the Skymetrics reference in `images/`, in **both light and dark
mode**, with Arkzen's real data mapped onto it. The reference is the source of
truth for layout, colour, spacing, radius, motion and composition.

This deliberately overrides the generic design defaults the `frontend-design`
skill warns about (large radii, soft shadows, gradient washes, identical card
kits). The brief pins the visual direction, and the brief's own words win.

Non-negotiable product rule that survives the redesign: **plain language**.
Arkzen is used by operators, not engineers. Every technical term in the current
UI is removed or replaced (see the glossary below).

---

## Stack

| Layer | From | To |
| --- | --- | --- |
| Framework | Next 14.2 (App Router) | **Next 16.3** (App Router, Turbopack) |
| UI runtime | React 18.3 | **React 19.3** |
| Styling | Tailwind 3.4 + `tailwind.config.ts` | **Tailwind 4.3**, CSS-first `@theme` |
| Motion | none | **motion 13** (Framer Motion) |
| Charts | `@tremor/react` (React 18 only) | purpose-built SVG charts in-repo |
| Primitives | shadcn generated set | fresh set on Radix, styled to the reference |

Preserved unchanged: `lib/domain`, `lib/data`, `lib/sources`, `lib/ai`,
`lib/client`, `app/api/*`, `scripts/*`. The redesign is presentation only.

---

## Screen map

Every element of the reference gets an Arkzen meaning. Nothing is decoration.

| Skymetrics element | Arkzen meaning |
| --- | --- |
| Brand + collapse in sidebar | Arkzen wordmark + sidebar collapse |
| Nav: Home / AI Assistant | Overview / Assistant |
| Nav: Product Types, Collections, Inventory, Returns | All opportunities, Saved, In progress, Done |
| Nav: Markets, ABC Analysis, Reports | Sources, Categories, Insights |
| Footer: Help & support, Settings | Help & support, Settings |
| Title + one-line subtitle | Page name + one plain-language sentence |
| `Last 7 days` picker | Real date-range control over the reporting window |
| `Redondo Brand` picker | **What you're looking for** (service profile) picker |
| KPI card (big figure + delta pill + "vs previous 7 days") | Opportunities, Worth pursuing, Reply rate, Won — same shape, real deltas |
| Dark "Sales by Country (Top 5)" panel | "Where opportunities come from (top 5)" |
| Two headline figures + horizontal stacked bar | Found vs. ignored, split by source |
| Ranked country table with flags + % change | Ranked source table with change |
| "Other countries" card + `Show Countries / Regions` pills | "All sources" + `Sources / Categories` toggle |
| 4×2 KPI mini-grid | Per-source metrics |
| Net Revenue bar chart + date range + callout | Opportunities found per day + callout |
| Rates two-line chart | Reply rate vs. win rate |
| Sales & Returns area chart | Found vs. worth pursuing |
| Sales conversion funnel bars | Found → worth pursuing → contacted → replied → won |
| Sessions gauge + segmented peak bar | Opportunities in flight + busiest hours |
| Date-range calendar sheet | The period picker, sheet form |
| AI Assistant panel (rail + bubbles + chips + input) | The assistant, on real opportunity context |
| Breakdown table inside the assistant | Breakdown by source or category |
| Top 10 Products spreadsheet (A–E columns, toolbar) | Top opportunities spreadsheet |

---

## Plain-language glossary

Applied everywhere, including empty states, errors, buttons and toasts.

| Current (internal) | Replace with |
| --- | --- |
| qualification / qualified | worth pursuing |
| evidence | the original post / what they said |
| acquisition, capture run | search |
| provider, adapter, corpus | where this came from |
| provenance | how we found it |
| fit / intent / urgency / reachability | how well it matches / how serious they seem / how urgent / can you reach them |
| score | match score |
| watch profile | what you're looking for |
| pipeline stage | status |
| AI deal partner | assistant |
| deterministic engine | built-in reasoning |
| grounding | based on |
| `PARTIAL_SUCCESS`, `ACCESS_RESTRICTED` | "Reddit blocked the search — showing saved results instead" |
| `NEEDS_REVIEW`, `WEAK`, `UNREACHABLE` | needs a look, not a strong match, can't reach them |

---

## Parity checklist

Checked against the running build, not against the plan. **All nine phases are
built and verified in the browser** — every route in `lib/nav.ts` resolves, and
the two screens with no reference image are recorded in the gap log rather than
left implied.

### 1. Shell
- [x] Floating rounded sidebar panel, grouped nav, active state, collapse control
- [x] Topbar: page title, period picker, profile picker, theme toggle
- [x] Light and dark palettes, both complete
- [x] Content column centred at the reference's max width on a grey page
- [x] Mobile nav: drawer + topbar trigger below 1024px (Design2)

### 2. Overview (`/`) — Design.png + Design3
- [x] 4 KPI cards: big figure, delta pill, note line
- [x] Dark top-sources panel: two headline figures, stacked bar, legend, ranked table
- [x] Daily bar chart with hover callout
- [x] Rates line chart
- [x] Funnel + "still in play" gauge row
- [x] "All sources" card — **not on this screen.** The brief's §2 lists it here while
      the screen map puts it on `/sources`; `Design.png` settles it as its own screen
      with its own title. Built at §6 below.

### 3. Opportunities (`/opportunities`) — Design.png markets table
- [x] Ranked table with source, volume, change, rate columns
- [x] Row hover, sort affordances, tabular figures
- [x] Spreadsheet view — the A–E column letters and 1..14 row gutter, kept verbatim
- [x] The three filtered views resolve and filter correctly

### 4. Opportunity detail (`/opportunities/[id]`) — Design3
- [x] Found vs worth pursuing area chart
- [x] Funnel bars with percentage labels
- [x] Gauge + segmented peak bar
- [x] All panels in the new card language

### 5. Assistant (`/assistant`) — Design3 assistant panel
- [x] Recent-conversation rail
- [x] Message bubbles, "thinking" indicator
- [x] Suggestion chips, composer, breakdown card
- The answer-level feedback row and the attach control are both **omitted**; the
  breakdown is the app's own figures rather than the model's. All three are in the
  gap log with reasons.

### 6. Sources (`/sources`) and Categories (`/categories`) — Design.png "Other countries"
- [x] Segmented control, selectable pills, 4×2 KPI mini-grid
- [x] Centred-figure card and the two-series line card

### 7. Insights (`/insights`) — Design3 General metrics
- [x] Full composition parity, both themes
- Reference→ArkZen element remaps are recorded in the gap log.

### 8. Mobile (Design2)
- [x] Compact KPI stack, gauge card, calendar range sheet
- [x] 1440 / 1024 / 390 verified in both themes

### 9. Help and support (`/help`) and Settings (`/settings`)
- [x] Both screens, in the card language of the screens either side of them
- [x] 1440 / 390 verified in both themes — `scrollWidth === clientWidth` on both, zero console errors
- Neither screen appears in any of the three reference images, so neither is a
  reproduction. Both are recorded in the gap log: `/settings` is a read-only view
  of the profile that actually governs scoring, and `/help` carries the
  plain-language vocabulary rather than a support channel the product does not have.

---

## Gap log

Running record of what the screenshot comparison flagged, and of every place the
build deliberately departs from the reference. Newest first. A deviation that is
not in this table is a bug.

| Date | Screen | Gap found | Status |
| --- | --- | --- | --- |
| 2026-09-12 | `/opportunities` | **Deliberate.** The spreadsheet's toolbar carries **two** controls — "Download as a spreadsheet file" and "Refresh from the database" — where the reference draws three. The two that are built are the two that have a backend: the download serialises the rows the grid is already holding, and the refresh re-reads the database. The third control in the reference is a column-visibility menu, and there is nothing behind it here: the grid's columns are fixed by its callers, there is no stored view and no settings table to hold one, so it would render a menu whose ticks did nothing on the next load. Omitting it leaves the toolbar one control shorter than the reference and keeps every control on the screen honest. Building it properly means persisting a column choice, which is a data change rather than a UI one. | By design |
| 2026-09-12 | period picker | **Deliberate.** In the calendar sheet, the days **between** the two ends of a range are tinted (`bg-brand-soft`), where the reference tints only the two endpoints. Tinting the ends alone leaves the reader to infer the span from two marks at its corners — the one thing a range control is being asked to show is which days it covers, and on a month grid that is not self-evident from the ends. The tint is the same `--brand-soft` the endpoints use, so the span reads as one continuous selection rather than a second kind of highlight. Recorded because it is a visible difference from the screenshot, not an oversight. | By design |
| 2026-09-12 | `/settings` | **Fixed — display truthfulness, and exactly the failure the "no internal vocabulary" rule exists to catch.** The first build rendered `profile.negativeSignals` straight into the badges, so the screen showed a *matcher's* vocabulary: `equity only`, `equity-only`, `unpaid`, `commission only`, `revenue share`, `no budget right now`, `for exposure` — lowercase matching fragments, two of which are the same rule spelled twice so the list showed a duplicate and read as a bug. None of them is a sentence anyone wrote for a reader. Added `blockedReasonLabels` in `lib/plain.ts`, beside `sourceLabel` and `runProblemLabel`, which maps the vocabulary to full sentences ("Paid only in equity", "Unpaid work", "Paid only as a share of revenue") and **deduplicates on the label** rather than the term — so the two equity spellings collapse to one pill while genuinely different rules keep both. An unmapped rule still reaches the screen, title-cased, rather than being hidden: these rules decide which leads a person never sees. Six rules now read as six lines. | Fixed |
| 2026-09-12 | `/settings` | **Deliberate.** The screen is **read-only**; it does not offer to edit the profile it describes. There is no settings table — `lib/data/migrations.ts` creates only `opportunities`, `activities`, `partner_messages`, `acquisition_runs` and `source_health` — and the profile is the `defaultServiceProfile` constant, so an editor would collect changes and drop them on the next request. Worse, `payload` is a frozen snapshot written at capture time, so changing the profile would **not re-score a single lead already in the list** while appearing to have worked. The page shows the real profile instead — name, description, locations, minimum engagement, capabilities and the blocked-work rules, read from the same object `scoring.ts` and `pipeline.ts` read — and a closing card says in as many words that editing is not built and what would and would not change when it is. The topbar's profile pill has linked here with the title **What you're looking for** since the shell was built, which is what fixes this page's job. The one control that *is* real, the theme choice, is here because it is genuinely persisted; it deliberately duplicates the topbar's switch — same component, same store, so they cannot disagree, and the row names the setting in a way the topbar's switch has no room to. | By design |
| 2026-09-12 | `/help` | **Deliberate.** No reference image depicts this screen, so its content is chosen rather than copied. It carries the **plain-language vocabulary** as a definition list — opportunity, match score, fit check, worth pursuing, in progress, done, reply rate, blocked search — alongside what Arkzen does as four steps and where leads come from. The four steps are numbered because they genuinely are a sequence, each depending on the one above it; the numbered marker is structure here, not decoration. What the screen deliberately does **not** carry is a support channel: there is no chat widget, no mailbox and no ticketing route anywhere in the app, so a "Contact us" button — the one thing a reader reaches for when something has gone wrong — would quietly do nothing. It offers the two destinations it can actually serve instead, `/sources` and `/insights`, and says plainly which question each one answers. | By design |
| 2026-09-12 | `/assistant` | **Fixed — found by measuring at 390px, and invisible at every other width.** The screen scrolled sideways: `scrollWidth` 612 against a 390 viewport, so the thread you were reading ran off the right edge. Cause: the rail's preview line is `truncate`, i.e. `white-space: nowrap`, and nowrap text has a **min-content equal to the whole string** — `overflow: hidden` does not reduce it. That propagated up through the row (558px), the card body (598px) and the column (600px) and out to the document. The column was a bare `grid` at that width, and a bare `grid` sizes its implicit track with a *min* function of `auto`, which is exactly that min-content; the `xl` template was always safe because it spells out `minmax(0, …)`. Fixed with `grid-cols-1`, which compiles to `repeat(1, minmax(0, 1fr))`. Verified 390/390 with nothing wider than the viewport in both themes. | Fixed |
| 2026-09-12 | `/assistant` | **Deliberate.** The rail groups by **elapsed time** — "Last 24 hours", "Last week", "Earlier" — where the reference says "Today", "Yesterday", "Last 7 days". The first two of the reference's labels are claims about *the reader's* calendar, and the grouping runs on the server, so the day boundary it would compute is the server's: on a UTC deployment a conversation half an hour old for a reader in UTC+2 falls on the previous UTC day and would be filed under "Yesterday". Elapsed hours are the same number wherever the reader is, which is why every age in this product already reads as a duration ("4h ago"). The thresholds are whole days, so each label is true of everything under it. | By design |
| 2026-09-12 | `/assistant` | **Deliberate.** The reference draws a breakdown table *inside* an answer, as something the model produced. There is no tool-calling here and `PartnerResponse` carries no tabular output, so the model cannot produce one. The card is therefore the app's own count of the period's leads by kind of work, in the assistant's left column beside the rail, and **its subtitle says so** — "from the app's own figures. This is not part of the assistant's answer." Keeping the reference's element while telling the truth about where its numbers came from is the reason the card exists rather than a reason to drop it. It is also the one panel on the screen that reads the period picker; the rail deliberately does not, because a conversation is dated by when it was last spoken in, and putting it behind the picker would make talking to someone remove them from the list at the end of the month. | By design |
| 2026-09-12 | `/assistant` | **Deliberate — a silent omission in Phase 4, made explicit here.** The reference puts a feedback row — thumbs up, thumbs down, copy, re-run — under every answer. Only copy and the two draft decisions are built, and only on an answer that carries a suggested message. There is no field anywhere that stores a rating of an answer, and the one backend that exists, `decidePartnerMessage`, means "I used this draft" — it writes the decision, and the activity log records it. Wiring a thumb to it would make the log claim someone sent a message they never sent, which is the exact class of falsehood this panel's own comments were written to avoid. So the row is omitted rather than rendered inert: a control that does nothing is worse than one that is not there. Adding it properly needs a rating column on `partner_messages`, which is a data change and not this phase's business. | Accepted |
| 2026-09-12 | `/assistant` | **Deliberate.** The composer's attach control is **absent**, where the plan called for it rendered `disabled` behind a tooltip. Its absence is stated instead: "Answers come from the post and your profile. Attachments aren't supported yet." A disabled paperclip explains itself only to a reader who thinks to hover it, and the fact — there is no upload route and no field on the message to hold a file — is worth saying to everyone. The layout is one line shorter than the reference's composer and the reason is on the screen rather than behind a pointer. | By design |
| 2026-09-12 | `/insights` | **Deliberate.** The reference's four chart cards are remapped to measures this product actually has. "Sales & Returns" → **"How the scores land"**, the score distribution by band, which is the one figure no other screen carries. "Traffic" → **"Searches you've run"**, the acquisition history: whether the pipeline that produces every other number on every other screen is still answering. "Sales conversion" → **"From found to won"**, unchanged in shape. "Sessions" → **"Worth your time"**, the dial reporting what share of the period cleared the fit check. Each keeps the reference's card slot, its proportions and its centred-vs-left treatment; only the measure changes, and each is named for what it measures. | By design |
| 2026-09-12 | `/insights` | **Deliberate.** The top row is **five** tiles, and a sixth — "Best matches", the count in the top band — was written and then removed. The band chart sits directly below it and carries that number as one of its four columns, so the tile would invite the reader to check the two against each other for no gain. The reference's top row is five cards; five is also what the measures support without repeating one. | By design |
| 2026-09-12 | `/insights` | **Deliberate.** The screen resolves the period window itself rather than reading the repository's `getInsights()` totals, which are unwindowed. The picker sits in the topbar above every screen, so a card that ignored it would report a different period from the four other screens sharing the same control — and the reader has no way to see that from the page. Same windowing helper and same `publishedAt` field as `/`, `/sources` and `/categories`. | By design |
| 2026-09-12 | `/`, `/insights`, `/opportunities/[id]` | **Fixed — display truthfulness, found by reading the rendered numbers rather than the screenshot.** Funnel stage 1 was named **"Worth pursuing"**, which is also the label of a status, of a saved view, of a nav item and of the KPI tile sitting two inches above the chart on both `/` and `/insights`. The two figures differ by construction and both are correct: the tile counts what is open *now* (`isWorthPursuing`, which excludes `LOST`), while the stage counts everything that ever got that far (the funnel must stay monotonic, so a lost-after-qualified deal still counts). On the seeded corpus that rendered **"Worth pursuing 3"** beside **"Worth pursuing 2"** with nothing to explain the gap — a reader could only conclude one of them was wrong. Renamed to **"Fit check"**, naming the milestone rather than the status, in the same words the opportunity table's Fit column and the tile notes already use. A regression test asserts no stage carries a status's name, with "Won" explicitly allowed because a won deal is won under either reading. | Fixed |
| 2026-09-12 | `/`, `/insights`, `/opportunities/[id]` | **Fixed — a latent bug the rename above exposed.** At 390px the funnel's five columns are 55px each, narrower than "Reached out" needs (71px), so the stage name rendered as "Reached o…" — and before the `w-full` added with this pass it did not clip at all, but overflowed into the column beside it ("Passed the checkReached out"). The shared `FunnelChart` now **wraps** the stage name instead of truncating it: a stage nobody can read is a stage that is not there. The two-line slot is reserved at `h-[30px]` in *every* column rather than measured per column, because the bars are anchored to the bottom of a fixed-height box — a column reserving one line would sit its bar 15px lower than the column beside it, and the whole point of a funnel is that the bars are comparable. The chart's default height moves 200 → 224 so the bars keep their height under the taller caption. Verified at 1440 and 390 on both routes: no clipped text anywhere, every bar bottom on one line, and the container's `scrollHeight` equal to its `height`. | Fixed |
| 2026-09-12 | `/sources`, `/categories` | **Deliberate.** The reference's `Show Countries ▾` dropdown is omitted. It exists to collapse a long pill list; with ten sources and six categories every pill fits on one line at 1440px, so a control that hides options the reader can already see would be chrome and nothing else. The pills themselves, their counts and their ordering are reproduced as shown. | By design |
| 2026-09-12 | `/sources`, `/categories` | **Deliberate.** The reference repeats "Compared to previous 7 days" under all eight mini-cards, including the four where it cannot be true — a rate is not measured in days, and the caption is wrong for any window the picker is set to. Each card carries a note that is specific to its own metric instead ("Cleared the fit check against what you sell", "Someone wrote back", "Scored 82 or above"). The card title and its note are the only text; no caption claims a comparison the card is not making. | By design |
| 2026-09-12 | `/sources`, `/categories` | **Deliberate.** The reference's "Net Revenue" card centres one large figure with the bar chart beneath it. Mapped to **"Busiest day"** — the period's peak day, that same column's bar pinned with a standing callout, and a share-of-period pill beside the day label. Chosen over repeating a period total, which the KPI grid already carries twice, and over duplicating a delta pill that appears on the tile directly above. The centred treatment is kept because the reference reserves it for a stated figure rather than a row in a table. | By design |
| 2026-09-12 | `/sources`, `/categories` | **Not fixed.** Every delta pill reads "n/a" on the seeded corpus. Verified against the database, not assumed: the 11 seeded rows are aged 4h–121h, so the 7-day window holds all 11 and the preceding 7-day window holds none — `change()` correctly returns `null` when there is no previous window to compare against, and a card must never imply a trend the data cannot support. `range=all` behaves the same because the previous span is still empty. This is a structural property of a freshly seeded corpus and resolves as real captures accumulate; fabricating a `capturedAt` spread to make the pills light up was considered and rejected. | Accepted |
| 2026-09-12 | Shell (all screens) | **Fixed — found by the screenshot comparison.** The theme toggle did not survive a reload: picking light and reloading came back dark. Cause, isolated by instrumenting `localStorage.setItem`: `ThemeProvider`'s persist effect ran on the first commit with the component's *default* state and wrote `"dark"` to storage before the effect that reads the stored choice had been committed back. With `reactStrictMode: true` the mount effects run twice, so the second read picked up the value the first pass had just clobbered and the choice was lost for good; without StrictMode it self-corrected but flashed the wrong theme on every load. Fixed by gating the persist-and-apply effect on a `resolved` flag, so nothing touches the document or storage until the real choice has been read — `themeInitScript` has already set both before paint. Verified end to end: one write per load, no flash, and light → toggle → dark → reload → dark → toggle → light round-trips. | Fixed |
| 2026-09-12 | `/sources`, `/categories` | **Fixed — a regression this pass introduced.** Adding a plural-aware unit to the bar-chart callout ("1 lead" / "4 leads") was first done by passing `unit={(value) => …}`. That is a function crossing from the server component `GroupPanel` into the client `BarChart`, which React cannot serialise — the page threw "Functions cannot be passed directly to Client Components" and rendered the error boundary. The declared prop type accepted it, so `tsc` was clean and the 79 tests passed; only the browser showed it. Fixed by making the unit a serialisable pair, `{ one, many }`, resolved through `unitFor` in `lib/charts.ts` with tests. This is the same trap recorded in `lib/groups.ts` for the group `match` closure. | Fixed |
| 2026-09-12 | `/opportunities` | **Deliberate addition.** A "Find new leads" button in the table toolbar, right of the view toggle, with no counterpart in the reference. Skymetrics reads a warehouse that fills itself; ArkZen's sources only move when asked, so without this control `/api/capture` has no caller at all and the list is a fixed set of seeded rows — the whole acquire half of the product would be unreachable from the interface. It reports sources that refused the search as a separate notice rather than folding them into the count, so "nothing new" and "we were blocked from looking" never read the same. Shown in the table view only; the grid is the reference's read-only spreadsheet and a control that writes does not belong in it. | By design |
| 2026-09-12 | `/opportunities` | **Deliberate.** The four dimension columns (Fit, Intent, Urgency, Reach) are plain right-aligned figures, not meters. Design.png gives exactly one column a bar — the ranking column, which has one — and four bars per row all render the same shade of green, which is decoration pretending to be data. | By design |
| 2026-09-12 | `/opportunities/[id]` | **Known limitation, not fixed.** A detail page with an unknown id renders the correct not-found UI but answers **200, not 404**: `app/loading.tsx` flushes the shell before the page resolves, and by then `notFound()` can no longer set the status. A genuinely unknown *path* (`/totally-unknown-path`) 404s correctly, so the response is only wrong for the id-not-found case. The loading boundary is load-bearing — `ensureReady()` migrates and seeds the corpus on a cold database, so the first hit does real work — so the boundary stays and the status is recorded rather than paid for. | Accepted |
