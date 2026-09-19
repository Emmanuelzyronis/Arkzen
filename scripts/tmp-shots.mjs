import { chromium } from "playwright-core";

const pages = process.argv[2] ? process.argv[2].split(",") : ["/"];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });

for (const theme of ["dark", "light"]) {
  const ctx = await browser.newContext({ viewport: { width: 1512, height: 1200 }, deviceScaleFactor: 2, colorScheme: theme });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const path of pages) {
    await page.goto(`http://localhost:3210${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1600);
    const name = path === "/" ? "overview" : path.replace(/\//g, "_").replace(/^_/, "");
    await page.screenshot({ path: `/tmp/shot-${name}-${theme}.png`, fullPage: true });
    const stats = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const bars = Array.from(document.querySelectorAll("button[aria-label] > span")).filter((el) => el.getBoundingClientRect().height > 2).length;
      const gauge = Array.from(document.querySelectorAll("svg path")).filter((p) => p.getAttribute("d")?.includes("A 70 70")).map((p) => p.style.strokeDashoffset || p.getAttribute("stroke-dashoffset"));
      return { overflow, bars, gauge };
    });
    console.log(`${theme} ${path} -> /tmp/shot-${name}-${theme}.png`, JSON.stringify(stats));
  }
  const real = errors.filter((e) => !e.includes("hmr") && !e.includes("WebSocket"));
  if (real.length) console.log(`${theme} errors:`, real.slice(0, 4));
  await ctx.close();
}
await browser.close();
