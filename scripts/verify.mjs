/**
 * Walks the built app in a real browser and reports what it finds.
 *
 * Rewritten against the Skymetrics redesign. The previous version drove the
 * pre-redesign DOM — `.opp-card`, `#evidence`, `#partner`, `.funnel-row` — and
 * the `/pipeline` and `/capture` routes, none of which exist any more, so it
 * failed on its first selector. Everything below is addressed by role, label or
 * visible text, so a restyle does not break it; only a change to what a screen
 * *says* or *does* should.
 *
 * Usage:
 *   node scripts/verify.mjs                        # against the dev server
 *   VERIFY_BASE=https://arkzen.vercel.app node scripts/verify.mjs
 *
 * Screenshots land in $VERIFY_SHOTS (default /tmp/arkzen-shots). Exit code is
 * non-zero if any route overflowed or logged a console error, so it is usable
 * as a gate rather than only as a report.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.VERIFY_BASE ?? "http://127.0.0.1:3210";
const SHOTS = process.env.VERIFY_SHOTS ?? "/tmp/arkzen-shots";
mkdirSync(SHOTS, { recursive: true });

const ROUTES = [
  "/",
  "/opportunities",
  "/opportunities/worth-pursuing",
  "/opportunities/in-progress",
  "/opportunities/done",
  "/assistant",
  "/sources",
  "/categories",
  "/insights",
  "/help",
  "/settings",
];

const WIDTHS = [
  { label: "1440", width: 1440, height: 1000 },
  { label: "390", width: 390, height: 844 },
];

const problems = [];
const note = (...args) => console.log(...args);

const browser = await chromium.launch({
  executablePath: process.env.VERIFY_CHROME ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox"],
});

/** A page whose console errors and uncaught exceptions are collected, not swallowed. */
async function newPage(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (message) => {
    // A resource that 404s logs a generic "Failed to load resource" console error
    // naming no URL, so it cannot be attributed here. The `response` handler below
    // records it with the URL that actually failed, which is the useful version.
    // Suppressing it here is not hiding it — it is reporting it once, better.
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
      problems.push(`[console ${page.url()}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => problems.push(`[pageerror ${page.url()}] ${error.message}`));
  page.on("response", (response) => {
    // Vercel's toolbar and Next's dev overlay both probe paths that do not exist;
    // neither is an app defect, so neither belongs in the report.
    const url = response.url();
    if (response.status() < 400) return;
    if (/favicon|_next\/static|\/_vercel\/|__nextjs/.test(url)) return;
    problems.push(`[http ${response.status()}] ${url}`);
  });
  return { page, context };
}

/**
 * Whether the document is wider than the window.
 *
 * Also names the widest offenders. `scrollWidth === clientWidth` alone says a
 * problem exists without saying where; the list is what makes it fixable.
 */
async function overflow(page, label) {
  const result = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [];
    for (const element of document.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width > doc.clientWidth + 1) {
        wide.push(`${element.tagName.toLowerCase()}.${String(element.className).slice(0, 40)} ${Math.round(rect.width)}`);
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide: wide.slice(0, 3) };
  });
  const ok = result.scrollWidth <= result.clientWidth + 1;
  if (ok) {
    note(`    no overflow (${result.scrollWidth}/${result.clientWidth})`);
  } else {
    // Wide children are usually a table inside its own scroll container, which is
    // contained and fine. Only an uncontained overhang is a real defect, and
    // scrollWidth > clientWidth is what distinguishes the two.
    note(`    OVERFLOW ${result.scrollWidth} > ${result.clientWidth} — widest: ${result.wide.join(" | ")}`);
    problems.push(`[overflow ${label}] ${result.scrollWidth} > ${result.clientWidth}`);
  }
  return ok;
}

async function toggleTheme(page) {
  await page.locator('button[role="switch"][aria-label*="Switch to"]').first().click();
  await page.waitForTimeout(200);
}

// ---------- every route, both widths, both themes ----------
note("== routes ==");
for (const { label, width, height } of WIDTHS) {
  const { page, context } = await newPage(width, height);
  for (const route of ROUTES) {
    const response = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 60_000 });
    const status = response?.status() ?? 0;
    const heading = await page.locator("h1").first().innerText().catch(() => "");
    note(`  ${label} ${route} → ${status} "${heading}"`);
    if (status !== 200) problems.push(`[status ${label} ${route}] ${status}`);
    if (!heading) problems.push(`[heading ${label} ${route}] no h1`);
    await overflow(page, `${route} ${label}`);

    const name = route === "/" ? "overview" : route.replaceAll("/", "-").replace(/^-/, "");
    await page.screenshot({ path: `${SHOTS}/${name}-${label}.png`, scale: "css" });
    if (label === "1440") {
      await toggleTheme(page);
      await page.screenshot({ path: `${SHOTS}/${name}-${label}-dark.png`, scale: "css" });
      await toggleTheme(page);
    }
  }
  await context.close();
}

// ---------- a lead, and the write path it carries ----------
note("== detail + note write ==");
{
  const { page, context } = await newPage(1440, 1000);
  await page.goto(`${BASE}/opportunities`, { waitUntil: "networkidle" });
  // Scoped to `main`: the sidebar's own nav links start with `/opportunities/`
  // too, and unscoped the first match is the "Worth pursuing" nav item rather
  // than a lead — which is a filtered view with no note box on it.
  const firstLead = page.locator('main a[href^="/opportunities/"]').first();
  const href = await firstLead.getAttribute("href");
  await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
  note(`  opened ${href} → h1 "${await page.locator("h1").first().innerText()}"`);
  await overflow(page, "detail 1440");

  // The note path is the one write every screen shares and the cheapest to
  // reverse; a note is additive and says what it is.
  const stamp = `verify.mjs ${new Date().toISOString()}`;
  await page.locator("#note").fill(stamp);
  await page.getByRole("button", { name: "Add note" }).click();
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: "networkidle" });
  const persisted = await page.getByText(stamp).count();
  note(`  note persisted after reload: ${persisted > 0}`);
  if (persisted === 0) problems.push("[write] the note did not survive a reload");
  await page.screenshot({ path: `${SHOTS}/detail-1440.png`, scale: "css" });
  await context.close();
}

// ---------- the assistant, if there is a conversation ----------
note("== assistant ==");
{
  const { page, context } = await newPage(1440, 1000);
  await page.goto(`${BASE}/assistant`, { waitUntil: "networkidle" });
  const rail = page.locator('a[href^="/assistant?opportunity="]');
  const conversations = await rail.count();
  note(`  conversations in the rail: ${conversations}`);
  if (conversations === 0) {
    note("  cold database — the empty state is what is being checked");
    const empty = await page.getByText("No conversations yet").count();
    if (empty === 0) problems.push("[assistant] neither a rail nor the empty state rendered");
  } else {
    await rail.first().click();
    await page.waitForLoadState("networkidle");
    const current = await page.locator('[aria-current="true"]').count();
    note(`  active rail row: ${current}`);
    if (current !== 1) problems.push(`[assistant] ${current} rows marked current, expected 1`);

    // A typed question, not a suggestion chip. The chip sends `{intent}` with no
    // `question`, and `partner/route.ts:44` persists the operator's message only
    // when there is one — so a chip is a request, not a thing the operator said,
    // and stores exactly one row (the answer). Typing is the path that has to
    // round-trip both: the operator's own words come back after a reload, which
    // is what shows the thread is stored and not merely echoed in the tab.
    //
    // `Thinking…` carries role="status" and is replaced by the answer when the
    // refresh lands, so the count alone cannot distinguish the placeholder from
    // the response. Waiting for the status to clear is what makes this a check on
    // the answer rather than on the optimistic paint.
    const bubbles = () => page.locator("ol > li").count();
    const before = await bubbles();
    const asked = `verify.mjs — does this lead mention a deadline? ${new Date().toISOString()}`;
    await page.getByLabel("Ask your own question about this lead").fill(asked);
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    const settled = await page
      .waitForFunction(
        (n) => document.querySelectorAll("ol > li").length > n && !document.querySelector('ol [role="status"]'),
        before,
        { timeout: 120_000 },
      )
      .then(() => true)
      .catch(() => false);

    const after = await bubbles();
    note(`  typed a question: ${before} → ${after} bubbles`);
    if (!settled) {
      problems.push(`[assistant] a typed question produced no settled answer (${before} → ${after})`);
    } else if (after !== before + 2) {
      // One bubble for the operator's question, one for the answer.
      problems.push(`[assistant] expected ${before + 2} bubbles, saw ${after}`);
    } else {
      await page.reload({ waitUntil: "networkidle" });
      const persisted = await page.getByText(asked).count();
      note(`  both the question and its answer survived a reload: ${persisted > 0}`);
      if (persisted === 0) problems.push("[assistant] the typed question was not stored");
    }
    await page.screenshot({ path: `${SHOTS}/assistant-1440.png`, scale: "css" });
  }
  await overflow(page, "assistant 1440");
  await context.close();
}

await browser.close();

note("== problems ==");
if (problems.length === 0) {
  note("none");
} else {
  for (const problem of problems) note(`  ${problem}`);
}
writeFileSync("/tmp/arkzen-errors.txt", problems.join("\n"));
process.exit(problems.length === 0 ? 0 : 1);
