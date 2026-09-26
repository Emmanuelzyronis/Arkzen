#!/usr/bin/env node
/**
 * Records an ~90-second ArkZen demo video showing the full lead-gen workflow.
 *
 * Narrative:
 *   0–12s   Overview dashboard — workspace at a glance, real metrics
 *  12–55s   Opportunities + Find leads hero moment — animation cycles through
 *           three states while Reddit is being scanned; leads appear
 *  55–72s   Lead detail — title, score breakdown, strategy
 *  72–85s   Assistant chat — AI grounded in the opportunity's evidence
 *  85–95s   Sources — Reddit connected
 *  95–100s  Back to overview — dashboard now reflects the found leads
 *
 * Usage: node scripts/record-demo.mjs
 * Output: /tmp/arkzen-demo/arkzen-demo.mp4
 */

import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const BASE       = "http://localhost:3000";
const CHROME     = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const OUT_DIR    = "/tmp/arkzen-demo";
const AUTH_FILE  = "/tmp/arkzen-auth.json";
const VIDEO_SIZE = { width: 1440, height: 900 };

const OWNER        = "user_3JinafvFqWxmVDgBhP83QyEpAXv";
const CLERK_SECRET = "sk_test_0NUkTGaZp1LINBtKDaDXPkcAkkVu3AxzRxV8L0t9gv";

mkdirSync(OUT_DIR, { recursive: true });
const log = (...args) => console.log("[demo]", ...args);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function smoothScroll(page, px, ms = 800) {
  const steps = Math.ceil(ms / 16);
  const step  = px / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((dy) => window.scrollBy(0, dy), step);
    await page.waitForTimeout(16);
  }
}

const beat   = (page, ms = 1200) => page.waitForTimeout(ms);
const pause  = (page, ms = 2000) => page.waitForTimeout(ms);
const linger = (page, ms = 3000) => page.waitForTimeout(ms);

async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
}

async function navTo(page, href) {
  const link = page.locator(`nav a[href="${href}"]`).first();
  await link.waitFor({ state: "visible", timeout: 8000 });
  await link.click();
  await page.waitForLoadState("networkidle");
  await beat(page, 600);
}

// ─── Step 0: Seed database ───────────────────────────────────────────────────

log("Seeding clean demo data into Neon…");
process.env.DATABASE_URL =
  "postgresql://neondb_owner:npg_T5kXOmLdjy7Y@ep-holy-hat-aw26y15u-pooler.c-12.us-east-1.aws.neon.tech/arkzen?sslmode=require";

const { createPostgresDriver } = await import(
  "/home/emmanuelzyronis/products/ArkZen/lib/data/postgres-driver.ts"
);
const db = await createPostgresDriver(process.env.DATABASE_URL);

// Wipe anything leftover
await db.query("DELETE FROM opportunities");
await db.query("DELETE FROM activities");
await db.query("DELETE FROM partner_messages");
await db.query("DELETE FROM acquisition_runs");
await db.query("DELETE FROM source_health");

const now = new Date();

// Seed a historical acquisition_run so dashboard charts have baseline data
const runId = `run_demo_hist_${Date.now()}`;
const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
await db.query(
  `INSERT INTO acquisition_runs
     (id, owner_id, started_at, completed_at, status, detail, observed, kept, rejected, duplicates, created, source_runs)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [
    runId, OWNER, threeDaysAgo, threeDaysAgo, "SUCCESS",
    "Baseline scan — Reddit r/forhire, r/startups, r/agency",
    43, 11, 32, 0, 11,
    JSON.stringify([{
      sourceId: "reddit-arctic", sourceName: "Reddit",
      status: "SUCCESS", detail: "11 signals", count: 11, durationMs: 4200,
    }]),
  ],
);

// Seed all 11 clean leads from local SQLite (which has valid pipeline payloads)
const BetterSqlite = require("/home/emmanuelzyronis/products/ArkZen/node_modules/better-sqlite3");
const sqlite = new BetterSqlite("./data/arkzen.sqlite3");
const sqliteRows = sqlite.prepare("SELECT * FROM opportunities ORDER BY score DESC").all();
log(`Seeding ${sqliteRows.length} leads from local SQLite…`);

for (let i = 0; i < sqliteRows.length; i++) {
  const r = sqliteRows[i];
  const hoursAgo = Math.floor((i / sqliteRows.length) * 90); // spread over 90h
  const date = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString();
  await db.query(
    `INSERT INTO opportunities (
       id, owner_id, source_object_id, source_kind, source_name, source_url,
       author_handle, title, content, published_at, captured_at,
       provider_id, data_kind, category, need_summary, intent_summary,
       score, band, status, outcome, outcome_note, payload, fingerprint,
       created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
     )`,
    [
      r.id, OWNER, r.source_object_id, r.source_kind, r.source_name, r.source_url,
      r.author_handle, r.title, r.content, date, date,
      r.provider_id, r.data_kind, r.category, r.need_summary, r.intent_summary,
      r.score, r.band, r.status, r.outcome ?? null, r.outcome_note ?? null,
      r.payload, r.fingerprint, date, date,
    ],
  );
  log(`  seeded: ${r.score} ${r.title.slice(0, 50)}`);
}

// Seed one activity for the WON lead to show lifecycle
await db.query(
  `INSERT INTO activities (id, owner_id, opportunity_id, kind, actor, summary, detail, status_from, status_to, meta, created_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [
    `act_demo_1`, OWNER, "opp_1008b27bc55efd3f",
    "OUTCOME", "user",
    "Marked as WON — project delivered",
    "Delivered the Next.js monorepo with Contentful CMS. Client approved all milestones.",
    null, null, null,
    new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
  ],
);

log("Database seeded. Starting browser…");

// ─── Step 1: Auth ─────────────────────────────────────────────────────────────

log("Generating Clerk sign-in token…");
const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method:  "POST",
  headers: { Authorization: `Bearer ${CLERK_SECRET}`, "Content-Type": "application/json" },
  body: JSON.stringify({ user_id: OWNER }),
});
if (!tokenRes.ok) {
  console.error("Clerk token error:", await tokenRes.text());
  process.exit(1);
}
const { url: ticketUrl } = await tokenRes.json();
const signInUrl = `${ticketUrl}&redirect_url=${encodeURIComponent(BASE)}`;
log("Sign-in URL ready:", signInUrl.slice(0, 80) + "…");

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none"],
});

log("Authenticating…");
{
  const ctx  = await browser.newContext({ viewport: VIDEO_SIZE });
  const page = await ctx.newPage();
  await page.goto(signInUrl, { waitUntil: "networkidle", timeout: 30_000 });
  try { await page.waitForURL(/localhost:3000/, { timeout: 20_000 }); } catch {}
  if (page.url().includes("/sign-in")) {
    log("ERROR: Ticket not consumed. Aborting.");
    await browser.close(); process.exit(1);
  }
  await page.waitForLoadState("networkidle");
  log("Authenticated. URL:", page.url());
  await ctx.storageState({ path: AUTH_FILE });
  await ctx.close();
}

// ─── Step 2: Record ───────────────────────────────────────────────────────────

log("Starting recording…");
const recordCtx = await browser.newContext({
  viewport: VIDEO_SIZE,
  deviceScaleFactor: 1,
  storageState: AUTH_FILE,
  recordVideo: { dir: OUT_DIR, size: VIDEO_SIZE },
});
const page = await recordCtx.newPage();

// ── Scene 1: Overview (0–14 s) ────────────────────────────────────────────────
log("Scene 1 — Overview");
await go(page, "/");
await pause(page, 2000);

// KPI cards: Opportunities found, Worth pursuing, Reply rate, Won
await beat(page, 2200);

// "Where they came from" bar chart
await smoothScroll(page, 360, 1100);
await beat(page, 2000);

// "Found per day" sparkline + "How often they lead somewhere"
await smoothScroll(page, 380, 1100);
await beat(page, 1800);

// Scroll back to top
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await beat(page, 900);

// ── Scene 2: Opportunities — browse the existing list, then run Find leads ─────
log("Scene 2 — Opportunities + Find leads");
await go(page, "/opportunities");
await page.waitForLoadState("networkidle");
await pause(page, 1800);

// Scroll slowly through the lead list — viewer reads existing titles
await smoothScroll(page, 180, 900);
await beat(page, 1400);
await smoothScroll(page, 180, 900);
await beat(page, 1600);
await smoothScroll(page, 160, 800);
await beat(page, 1400);

// Scroll back to top — the Find leads button needs to be in frame
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await beat(page, 1000);

// ── Find leads — the hero moment ──────────────────────────────────────────────
const findLeadsBtn = page.locator('button:has-text("Find leads")');
await findLeadsBtn.waitFor({ state: "visible", timeout: 8000 });

// Hover for 2.5 s — draws the viewer's eye before the click
await findLeadsBtn.hover();
await linger(page, 2500);
await findLeadsBtn.click();
log("  Find leads clicked — watching animation…");

// Wait for "Looking for leads…" to appear on the button
await page.waitForSelector('button:has-text("Looking for leads")', { timeout: 4000 }).catch(() => {});
log("  Step 1: Looking for leads…");
await beat(page, 7000); // full 7 s — viewer reads this state

// "Scanning sources…" appears at 7 s via the useEffect interval
await page.waitForSelector('button:has-text("Scanning sources")', { timeout: 3000 }).catch(() => {});
log("  Step 2: Scanning sources…");
await beat(page, 7000); // full 7 s on this state

// "Almost there…" appears at 14 s
await page.waitForSelector('button:has-text("Almost there")', { timeout: 3000 }).catch(() => {});
log("  Step 3: Almost there…");
await beat(page, 5000);

// Wait for the API response — button returns to "Find leads" or flashes "Leads found!"
log("  Waiting for API response…");
await page.waitForSelector('button:has-text("Find leads"), button:has-text("Leads found")', {
  timeout: 45_000,
}).catch(() => {});
log("  API responded — letting toast and page refresh settle…");
await pause(page, 3500); // viewer reads the toast and sees the count update

// Scroll through the freshly-updated list — this is the "leads found" reveal
await smoothScroll(page, 200, 900);
await beat(page, 1600);
await smoothScroll(page, 200, 900);
await beat(page, 1800);
await smoothScroll(page, 180, 800);
await beat(page, 1400);

// Scroll back to top to find and click the best lead
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await beat(page, 900);

// ── Scene 3: Lead detail — click the top-scored card from the live list ────────
log("Scene 3 — Lead detail");
const firstLeadCard = page.locator('a[href*="/opportunities/opp_"]').first();
await firstLeadCard.waitFor({ state: "visible", timeout: 8000 });
const leadHref = await firstLeadCard.getAttribute("href");
log(`  Opening: ${leadHref}`);
await firstLeadCard.click();
await page.waitForLoadState("networkidle");
await pause(page, 2000);

// Title and source badge are above the fold — reading beat
await beat(page, 2500);

// Scroll to need summary + score breakdown
await smoothScroll(page, 380, 1000);
await beat(page, 2200);

// Score breakdown (Fit / Intent / Urgency / Reachability)
await smoothScroll(page, 340, 1000);
await beat(page, 2200);

// Strategy + AI suggestion
await smoothScroll(page, 300, 900);
await beat(page, 2000);

// ── Scene 4: Assistant (74–87 s) ──────────────────────────────────────────────
log("Scene 4 — Assistant");
await navTo(page, "/assistant");
await pause(page, 1000);

const textarea = page.locator('textarea[placeholder*="pipeline"], textarea[placeholder*="ask"], textarea').first();
await textarea.waitFor({ state: "visible", timeout: 8000 });
await textarea.click();
await beat(page, 500);

const question = "Which lead is my best bet this week, and what should I say first?";
await page.keyboard.type(question, { delay: 28 });
await beat(page, 700);
await page.keyboard.press("Enter");
log("  Waiting for AI response…");

const replied = await page
  .waitForFunction(
    () => {
      const bubbles = document.querySelectorAll(".flex.justify-start .rounded-2xl");
      const last = bubbles[bubbles.length - 1];
      return last && last.textContent.trim().length > 20 && !last.querySelector(".animate-pulse");
    },
    undefined,
    { timeout: 45_000 },
  )
  .then(() => true)
  .catch(() => { log("  AI timed out — continuing"); return false; });

if (replied) log("  AI response received.");
await pause(page, 1500);
await smoothScroll(page, 280, 800);
await beat(page, 2200);
await smoothScroll(page, 200, 700);
await beat(page, 1800);

// ── Scene 5: Sources (87–95 s) ────────────────────────────────────────────────
log("Scene 5 — Sources");
await navTo(page, "/sources");
await pause(page, 1800);
await smoothScroll(page, 280, 900);
await beat(page, 2000);

// ── Scene 6: Back to overview — outro (95–100 s) ──────────────────────────────
log("Scene 6 — Outro");
await navTo(page, "/");
await pause(page, 2500);
await smoothScroll(page, 300, 900);
await beat(page, 2000);

log("Recording complete — closing context.");
await recordCtx.close();
await browser.close();

// ─── Convert to MP4 ──────────────────────────────────────────────────────────
const webmFiles = readdirSync(OUT_DIR).filter((f) => f.endsWith(".webm"));
if (!webmFiles.length) { log("ERROR: No WebM found"); process.exit(1); }
const webm = join(OUT_DIR, webmFiles.sort().at(-1));
const mp4  = join(OUT_DIR, "arkzen-demo.mp4");

log("Converting", webm, "→", mp4);
const ff = spawnSync("ffmpeg", [
  "-y", "-i", webm,
  "-c:v", "libx264", "-preset", "slow", "-crf", "18",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
  mp4,
], { stdio: "inherit" });

if (ff.status !== 0) { log("ffmpeg failed. Raw WebM at", webm); process.exit(1); }

log("Done. Video saved to:", mp4);
