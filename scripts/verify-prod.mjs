/**
 * Live production verification.
 *
 * Fetches the deployed app and asserts the *rendered* result, not a local
 * build: the opportunity feed must render as a data table, the old
 * badge-soup footer must be gone, and the hero accent must stay contained to
 * its own strip above the table.
 */
import { chromium } from "playwright-core";

const BASE = process.env.VERIFY_BASE ?? "https://arkzen.vercel.app";
const shots = process.env.VERIFY_SHOTS ?? "/tmp/arkzen-shots";
const errors = [];
const failures = [];

function check(label, condition, detail = "") {
  const ok = Boolean(condition);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });

async function open(width, height) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[console] ${m.text().slice(0, 180)}`); });
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message.slice(0, 180)}`));
  return { page, context };
}

const { page } = await open(1440, 1000);
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector("[data-opportunity-table]", { timeout: 20000 });

const rows = await page.locator("[data-opportunity-row]").count();
check("feed renders data-table rows", rows > 0, `${rows} rows`);

const oldFooter = await page.locator(".opp-card-secondary").count();
const oldCards = await page.locator(".opp-card").count();
check("old badge-soup footer is gone", oldFooter === 0, `.opp-card-secondary = ${oldFooter}`);
check("old card grid is gone", oldCards === 0, `.opp-card = ${oldCards}`);

const badgeFooterText = await page.locator("text=/High fit/").count();
check("no 'High fit' badge text in the feed", badgeFooterText === 0);

const scoreCells = await page.locator("th", { hasText: "Score" }).count();
check("score column present", scoreCells > 0);
for (const header of ["Opportunity", "Category", "Freshness", "Status", "Fit", "Intent", "Urgency", "Reach", "Why surfaced"]) {
  check(`column present: ${header}`, (await page.locator("th", { hasText: header }).count()) > 0);
}

const heroBox = await page.locator("[data-hero-strip]").boundingBox();
const tableBox = await page.locator("[data-opportunity-table]").boundingBox();
check("hero strip exists", Boolean(heroBox));
check("hero sits above the table", heroBox && tableBox && heroBox.y + heroBox.height <= tableBox.y, `hero bottom ${Math.round((heroBox?.y ?? 0) + (heroBox?.height ?? 0))} <= table top ${Math.round(tableBox?.y ?? 0)}`);
check("table starts above the fold", tableBox && tableBox.y < 900, `table top ${Math.round(tableBox?.y ?? -1)}px`);
check("hero accent is clipped", (await page.locator("[data-hero-strip].overflow-hidden").count()) > 0);

await page.screenshot({ path: `${shots}/prod-01-feed.png` });

await page.locator("[data-opportunity-row]").first().click();
await page.waitForSelector("#evidence", { timeout: 20000 });
check("row click opens the detail route", /\/opportunities\//.test(page.url()), page.url().replace(BASE, ""));
await page.screenshot({ path: `${shots}/prod-02-detail.png` });

await page.goto(`${BASE}/insights`, { waitUntil: "networkidle" });
check("insights renders Tremor charts", (await page.locator("svg.recharts-surface").count()) > 0);
await page.screenshot({ path: `${shots}/prod-03-insights.png` });

const mobile = await open(390, 844);
await mobile.page.goto(BASE, { waitUntil: "networkidle" });
const overflow = await mobile.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check("no page-level horizontal overflow on mobile", overflow <= 1, `${overflow}px`);
await mobile.page.screenshot({ path: `${shots}/prod-04-mobile.png` });
await mobile.context.close();

await browser.close();
console.log("console errors:", errors.length === 0 ? "none" : errors.slice(0, 6).join("\n"));
if (failures.length) {
  console.error(`\n${failures.length} live verification check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nAll live production checks passed.");
