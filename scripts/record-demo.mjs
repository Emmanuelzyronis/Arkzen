#!/usr/bin/env node
/**
 * Records a 90-second ArkZen demo video showing the full lead-gen workflow.
 *
 * Auth: Clerk sign-in token (no password needed — uses the backend secret key
 * to create a one-time login link for the owner account).
 *
 * Output: /tmp/arkzen-demo/arkzen-demo.mp4
 *
 * Usage: node scripts/record-demo.mjs
 */

import { chromium } from "playwright-core";
import { execSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE       = "http://localhost:3000";
const CHROME     = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
const OUT_DIR    = "/tmp/arkzen-demo";
const AUTH_FILE  = "/tmp/arkzen-auth.json";
const VIDEO_SIZE = { width: 1440, height: 900 };

// The owner account we're recording as.
const CLERK_USER_ID = "user_3JinafvFqWxmVDgBhP83QyEpAXv";
const CLERK_SECRET  = "sk_test_0NUkTGaZp1LINBtKDaDXPkcAkkVu3AxzRxV8L0t9gv";

mkdirSync(OUT_DIR, { recursive: true });

const log = (...args) => console.log("[demo]", ...args);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Smooth-scroll by `px` pixels over `ms` milliseconds. */
async function smoothScroll(page, px, ms = 800) {
  const steps = Math.ceil(ms / 16);
  const step  = px / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((dy) => window.scrollBy(0, dy), step);
    await page.waitForTimeout(16);
  }
}

/** Pause briefly for a "reading" beat. */
const beat   = (page, ms = 1200) => page.waitForTimeout(ms);
const pause  = (page, ms = 2000) => page.waitForTimeout(ms);
const linger = (page, ms = 3000) => page.waitForTimeout(ms);

/** Navigate and wait for the page to be idle. */
async function go(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
}

/** Click a nav link in the sidebar. */
async function navTo(page, href) {
  const link = page.locator(`nav a[href="${href}"]`).first();
  await link.waitFor({ state: "visible", timeout: 8000 });
  await link.click();
  await page.waitForLoadState("networkidle");
  await beat(page, 600);
}

// ─── Step 1: Auth ─────────────────────────────────────────────────────────────

log("Generating Clerk sign-in token…");
const tokenRes = await fetch("https://api.clerk.com/v1/sign_in_tokens", {
  method:  "POST",
  headers: {
    Authorization:  `Bearer ${CLERK_SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ user_id: CLERK_USER_ID }),
});
if (!tokenRes.ok) {
  console.error("Clerk token error:", await tokenRes.text());
  process.exit(1);
}
const { url: ticketUrl } = await tokenRes.json();
// Tell Clerk where to send the browser after auth.
const signInUrl = `${ticketUrl}&redirect_url=${encodeURIComponent(BASE)}`;
log("Sign-in URL ready:", signInUrl.slice(0, 80) + "…");

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--font-render-hinting=none",   // crisp text in headless
  ],
});

log("Authenticating (no recording)…");
{
  const ctx  = await browser.newContext({ viewport: VIDEO_SIZE });
  const page = await ctx.newPage();

  await page.goto(signInUrl, { waitUntil: "networkidle", timeout: 30_000 });

  // Clerk will redirect to localhost:3000 after consuming the ticket.
  // Give it up to 20 s to complete the chain.
  try {
    await page.waitForURL(/localhost:3000/, { timeout: 20_000 });
  } catch {
    log("URL after auth attempt:", page.url());
    log("Checking for dashboard content anyway…");
  }

  // If we landed on /sign-in, the ticket was rejected or expired.
  if (page.url().includes("/sign-in")) {
    log("ERROR: Landed on sign-in page — ticket not consumed. Aborting.");
    await browser.close();
    process.exit(1);
  }

  await page.waitForLoadState("networkidle");
  log("Authenticated. URL:", page.url());
  await ctx.storageState({ path: AUTH_FILE });
  log("Auth state saved to", AUTH_FILE);
  await ctx.close();
}

// ─── Step 2: Record ───────────────────────────────────────────────────────────

log("Starting recording context…");
const recordCtx = await browser.newContext({
  viewport: VIDEO_SIZE,
  deviceScaleFactor: 1,
  storageState: AUTH_FILE,
  recordVideo: {
    dir:  OUT_DIR,
    size: VIDEO_SIZE,
  },
});

const page = await recordCtx.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") log("  [browser error]", msg.text().slice(0, 120));
});

// ── Scene 1: Overview dashboard (0-20 s) ──────────────────────────────────────
log("Scene 1 — Overview");
await go(page, "/");
await pause(page, 2400);                       // let charts render

// KPI cards are above the fold — give them a reading beat
await beat(page, 2000);

// Scroll slowly into the hero "Where they came from" block
await smoothScroll(page, 380, 1400);
await beat(page, 2000);

// Continue to the bar/trend charts
await smoothScroll(page, 380, 1100);
await beat(page, 1800);

// Funnel + "Still in play" gauge
await smoothScroll(page, 360, 1100);
await beat(page, 1800);

// "Needs you today" — the freshest leads as link cards
await smoothScroll(page, 360, 1100);
await beat(page, 2000);

// Recent searches at the bottom
await smoothScroll(page, 300, 900);
await beat(page, 1800);

// Scroll back up so nav is comfortable
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await beat(page, 900);

// ── Scene 2: Opportunities list + Find leads (18-38 s) ────────────────────────
log("Scene 2 — Opportunities");
await go(page, "/opportunities?range=all");
await pause(page, 1800);

// Scroll through the lead list slowly
await smoothScroll(page, 280, 900);
await beat(page, 1200);
await smoothScroll(page, 280, 900);
await beat(page, 1600);

// Hover over the first lead card to show the interactive feel
const firstCard = page.locator('a[href*="/opportunities/opp_"]').first();
await firstCard.waitFor({ state: "visible", timeout: 10_000 });
await firstCard.hover();
await beat(page, 1000);

// Hover the second one
const secondCard = page.locator('main a[href^="/opportunities/"]').nth(1);
if (await secondCard.count()) {
  await secondCard.hover();
  await beat(page, 800);
}

// Scroll back up to show the "Find leads" button in the table header
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
await beat(page, 800);

// Click "Find leads" — shows the product actively fetching from sources
const findLeadsBtn = page.locator('button:has-text("Find leads"), button:has-text("Looking")').first();
if (await findLeadsBtn.count()) {
  await findLeadsBtn.hover();
  await beat(page, 600);
  await findLeadsBtn.click();
  log("  Find leads clicked — showing loading state…");
  // Wait for "Looking…" to appear
  await page.waitForSelector('button:has-text("Looking")', { timeout: 4000 }).catch(() => {});
  await linger(page, 2200); // let viewer see the in-progress state
}
// Don't wait for completion — continue the demo; toast will show if it finishes

// ── Scene 3: Lead detail (38-58 s) ────────────────────────────────────────────
log("Scene 3 — Lead detail");
await firstCard.click();
await page.waitForLoadState("networkidle");
await pause(page, 2000);

// Title area is visible — let viewer read the title and source badge
await beat(page, 2500);

// Scroll to evidence / content body
await smoothScroll(page, 360, 1000);
await beat(page, 2200);

// Continue scrolling — score breakdown
await smoothScroll(page, 360, 1000);
await beat(page, 2200);

// AI suggestion and activity timeline
await smoothScroll(page, 320, 1000);
await beat(page, 2000);

// ── Scene 4: Assistant chat (55-77 s) ─────────────────────────────────────────
log("Scene 4 — Assistant");
await navTo(page, "/assistant");
await pause(page, 1200);

const textarea = page.locator('textarea[placeholder*="pipeline"]');
await textarea.waitFor({ state: "visible", timeout: 8000 });
await textarea.click();
await beat(page, 500);

const question = "Which lead is my best bet this week, and what should I say to open the conversation?";
// Type like a human — fast but not instant
await page.keyboard.type(question, { delay: 30 });
await beat(page, 700);

// Send
await page.keyboard.press("Enter");
log("  Waiting for AI response…");

// Typing indicator appears → wait up to 45 s for the AI reply
const replied = await page
  .waitForFunction(
    () => {
      const bubbles = document.querySelectorAll(".flex.justify-start .rounded-2xl");
      const last = bubbles[bubbles.length - 1];
      // The loading indicator has 3 dots with animate-pulse; the real reply is text
      return last && last.textContent.trim().length > 20 && !last.querySelector(".animate-pulse");
    },
    undefined,
    { timeout: 45_000 },
  )
  .then(() => true)
  .catch(() => {
    log("  AI response timed out — continuing");
    return false;
  });

if (replied) {
  log("  AI response received.");
}

await pause(page, 1800);
// Scroll down so the full response is visible
await smoothScroll(page, 300, 900);
await beat(page, 2500);
await smoothScroll(page, 220, 800);
await beat(page, 2000);

// ── Scene 5: Sources (78-90 s) ────────────────────────────────────────────────
log("Scene 5 — Sources");
await navTo(page, "/sources");
await pause(page, 2000);

// Scroll down to show source cards (HN + Reddit both connected)
await smoothScroll(page, 320, 1000);
await beat(page, 2200);
await smoothScroll(page, 260, 900);
await beat(page, 1800);

// ── Scene 6: Back to overview — outro (90-96 s) ────────────────────────────────
log("Scene 6 — Outro");
await navTo(page, "/");
await pause(page, 2800);

// One final slow scroll to end on the hero stats
await smoothScroll(page, 320, 1100);
await beat(page, 2200);

log("Recording complete — closing context.");
await recordCtx.close();
await browser.close();

// ─── Step 3: Find the recorded file and convert to MP4 ────────────────────────
const webmFiles = readdirSync(OUT_DIR).filter((f) => f.endsWith(".webm"));
if (webmFiles.length === 0) {
  log("ERROR: No WebM found in", OUT_DIR);
  process.exit(1);
}
const webm = join(OUT_DIR, webmFiles.sort().at(-1));
const mp4  = join(OUT_DIR, "arkzen-demo.mp4");

log("Converting", webm, "→", mp4);
const ff = spawnSync("ffmpeg", [
  "-y",
  "-i", webm,
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "18",          // near-lossless quality
  "-pix_fmt", "yuv420p", // broadest compatibility
  "-movflags", "+faststart",
  "-an",                 // no audio track (screen recording has none)
  mp4,
], { stdio: "inherit" });

if (ff.status !== 0) {
  log("ffmpeg failed. The raw WebM is still at", webm);
  process.exit(1);
}

log("Done. Video saved to:", mp4);
log("Duration is approximately 90 seconds.");
