import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://127.0.0.1:3210";
const out = "/tmp/arkzen-shots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const targets = [
  ["/", "feed", 1440, 1000],
  ["/insights", "insights", 1440, 1000],
  ["/capture", "capture", 1440, 1000],
  ["/pipeline", "pipeline", 1440, 1000],
  ["/", "feed-mobile", 390, 844],
];
for (const [route, name, width, height] of targets) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log(name, "errors:", errs.length ? errs.join(" | ") : "none");
  await ctx.close();
}
// detail page from the first row
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.locator("[data-opportunity-row]").first().click();
await page.waitForSelector("#evidence", { timeout: 20000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/detail.png`, fullPage: false });
console.log("detail url:", page.url());
await ctx.close();
await browser.close();
