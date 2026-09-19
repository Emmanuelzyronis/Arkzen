import { describe, expect, it } from "vitest";
import { keywordExcerpt, needAddsDetail } from "@/lib/domain/summary";

describe("needAddsDetail", () => {
  it("hides a need line that only repeats the title", () => {
    const title = "Need someone to build an AI tool that turns our support tickets into product insights";
    expect(needAddsDetail(title, title)).toBe(false);
  });

  it("ignores case and punctuation differences when comparing", () => {
    expect(needAddsDetail("Need a Rails dev", "need a rails dev.")).toBe(false);
  });

  it("keeps a genuinely different summary", () => {
    expect(needAddsDetail("Backend help", "Migrate a legacy Rails app to a multi-tenant setup")).toBe(true);
  });

  it("hides empty summaries", () => {
    expect(needAddsDetail("Backend help", "   ")).toBe(false);
  });
});

describe("keywordExcerpt", () => {
  it("keeps a short ask in the author's words", () => {
    const title = "Looking for a subcontractor for Webflow → headless Next.js migrations";
    expect(keywordExcerpt(title, "Anything else")).toBe(title);
  });

  it("falls back to the first sentence when the title is not an ask", () => {
    const title = "UX research help";
    const content =
      "Our team is rebuilding the onboarding flow and we need someone to run usability sessions with real customers next month. Budget is open.";
    expect(keywordExcerpt(title, content)).toContain("usability sessions");
  });
});
