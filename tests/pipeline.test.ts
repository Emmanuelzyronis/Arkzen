import { describe, expect, it } from "vitest";
import { corpus } from "@/data/corpus";
import { buildOpportunities, dedupeSignals, filterSignals, fingerprintSignal } from "@/lib/domain/pipeline";
import { corpusSource } from "@/lib/sources/corpus-source";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import { detectCategory } from "@/lib/domain/category";
import { freshnessScore, scoreSignal } from "@/lib/domain/scoring";
import { extractMoney, keyExcerpt, matchedTerms, normalize } from "@/lib/domain/text";
import type { CandidateSignal } from "@/lib/domain/types";

async function signals(): Promise<CandidateSignal[]> {
  const result = await corpusSource.search(defaultServiceProfile, 100);
  return result.signals;
}

describe("text helpers", () => {
  it("extracts the largest money figure with k/m suffixes", () => {
    expect(extractMoney("budget around $8-12k for the build")).toBe(12000);
    expect(extractMoney("$3k/month retainer or $6-9k fixed")).toBe(9000);
    expect(extractMoney("no numbers here")).toBeNull();
  });

  it("keeps a stated minimum engagement readable as a figure", () => {
    expect(extractMoney("$2,000")).toBe(2000);
  });

  it("reads the budget figure rather than the biggest number in the post", () => {
    expect(extractMoney("we made $2M last year, budget $5k")).toBe(5000);
    expect(extractMoney("Budget: happy to pay a $3k/month retainer or a fixed build fee around $6-9k")).toBe(9000);
    expect(extractMoney("budget between 40k and 60k")).toBe(60000);
  });

  it("matches plurals of short acronyms without matching inside a longer word", () => {
    expect(matchedTerms("we use LLMs daily", ["llm"])).toEqual(["llm"]);
    expect(matchedTerms("two APIs and a RAG pipeline", ["api", "rag"])).toEqual(["api", "rag"]);
    expect(matchedTerms("llmxyz is not a word", ["llm"])).toEqual([]);
    expect(matchedTerms("we are available", ["ai"])).toEqual([]);
  });

  it("keeps an operator readable need summary", () => {
    const summary = keyExcerpt("Need someone to build an AI tool that turns tickets into insights");
    expect(summary).toContain("AI tool");
    expect(summary.length).toBeLessThanOrEqual(150);
  });

  it("decays freshness over time", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const fresh = freshnessScore("2026-01-10T09:00:00Z", now);
    const stale = freshnessScore("2026-01-01T09:00:00Z", now);
    expect(fresh).toBe(100);
    expect(stale).toBeLessThan(40);
  });
});

describe("category detection", () => {
  it("classifies AI integration work", () => {
    expect(detectCategory("we need a rag chatbot over our documentation").category).toBe("ai-integration");
  });

  it("classifies data warehouse work", () => {
    expect(detectCategory("our snowflake bill doubled, dbt models need a cost audit").category).toBe("data");
  });
});

describe("filtering and deduplication", () => {
  it("rejects equity-only, promotional, unpaid and supply-side signals", async () => {
    const { rejected, kept } = filterSignals(await signals(), defaultServiceProfile);
    const rules = rejected.map((entry) => entry.rule);
    expect(rules).toContain("negative pattern");
    expect(rules).toContain("promotional post");
    expect(
      rejected.some((entry) => entry.signal.sourceObjectId === "corpus:noise-unpaid-015"),
    ).toBe(true);
    expect(rules).toContain("supply-side post");
    expect(rejected.length).toBeGreaterThanOrEqual(4);
    expect(kept.length).toBeGreaterThanOrEqual(9);
  });

  it("collapses duplicate content into one signal", async () => {
    const all = await signals();
    const duplicated = [...all, ...all];
    const { unique, duplicates } = dedupeSignals(duplicated);
    expect(unique.length).toBe(all.length);
    expect(duplicates).toBe(all.length);
  });

  it("produces a stable fingerprint per source object", async () => {
    const all = await signals();
    expect(fingerprintSignal(all[0])).toBe(fingerprintSignal(all[0]));
    expect(fingerprintSignal(all[0])).not.toBe(fingerprintSignal(all[1]));
  });
});

describe("scoring", () => {
  it("is deterministic for the same signal and profile", async () => {
    const all = await signals();
    const fixedNow = new Date("2026-06-01T12:00:00Z");
    const first = scoreSignal(all[0], defaultServiceProfile, fixedNow);
    const second = scoreSignal(all[0], defaultServiceProfile, fixedNow);
    expect(first.score).toBe(second.score);
    expect(first.fit.checks.length).toBeGreaterThan(0);
  });

  it("explains every dimension with checks that carry detail", async () => {
    const all = await signals();
    const scored = scoreSignal(all[0], defaultServiceProfile);
    for (const dimension of [scored.fit, scored.intent, scored.urgency, scored.reachability]) {
      expect(dimension.checks.length).toBeGreaterThan(0);
      for (const check of dimension.checks) {
        expect(check.detail.length).toBeGreaterThan(10);
        expect(["pass", "warn", "unknown"]).toContain(check.status);
      }
    }
  });

  it("scores an explicit, budgeted, fresh request higher than a vague one", async () => {
    const all = await signals();
    const hero = all.find((signal) => signal.sourceObjectId === "corpus:ai-internal-tool-001")!;
    const vague = all.find((signal) => signal.sourceObjectId === "corpus:internal-dashboard-010")!;
    const fixedNow = new Date();
    expect(scoreSignal(hero, defaultServiceProfile, fixedNow).score).toBeGreaterThan(
      scoreSignal(vague, defaultServiceProfile, fixedNow).score,
    );
  });
});

describe("full pipeline", () => {
  it("turns the captured corpus into scored, qualified opportunities", async () => {
    const result = buildOpportunities(await signals(), defaultServiceProfile);
    expect(result.observed).toBe(corpus.length);
    expect(result.opportunities.length).toBeGreaterThanOrEqual(9);
    for (const opportunity of result.opportunities) {
      expect(opportunity.score).toBeGreaterThan(0);
      expect(opportunity.reasons.length).toBeGreaterThan(0);
      expect(opportunity.qualification.verdict).toMatch(/QUALIFIED|NEEDS_REVIEW|WEAK/);
      expect(opportunity.strategy.suggestedMessage.length).toBeGreaterThan(80);
      expect(opportunity.nextAction.action.length).toBeGreaterThan(10);
      expect(opportunity.qualification.whyQualified.length).toBeGreaterThan(0);
    }
  });

  it("ranks the hero opportunity as high fit and qualified", async () => {
    const result = buildOpportunities(await signals(), defaultServiceProfile);
    const hero = result.opportunities.find((entry) => entry.signal.sourceObjectId === "corpus:ai-internal-tool-001")!;
    expect(hero.score).toBeGreaterThanOrEqual(80);
    expect(hero.band).toBe("High");
    expect(hero.qualification.verdict).toBe("QUALIFIED");
    expect(hero.fit.checks[0].detail).toContain("AI integration & RAG");
    expect(hero.strategy.suggestedMessage).toContain("r/startups");
  });

  it("flags an unstated budget as a risk instead of ignoring it", async () => {
    const result = buildOpportunities(await signals(), defaultServiceProfile);
    const noBudget = result.opportunities.find(
      (entry) => entry.signal.sourceObjectId === "corpus:internal-dashboard-010",
    )!;
    expect(normalize(noBudget.qualification.unknowns.join(" "))).toContain("budget");
    expect(
      noBudget.fit.checks.some((check) => check.label.includes("Budget not stated") && check.status === "unknown"),
    ).toBe(true);
  });
});
