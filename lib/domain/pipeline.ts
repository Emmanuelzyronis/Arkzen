import { createHash } from "node:crypto";
import { categoryLabel } from "./category";
import { qualify } from "./qualification";
import { scoreSignal } from "./scoring";
import { buildNextAction, buildStrategy } from "./strategy";
import { keywordExcerpt } from "./summary";
import { normalize, termPattern, wordCount } from "./text";
import type {
  CandidateSignal,
  OpportunityCategory,
  ScoredOpportunity,
  ServiceProfile,
} from "./types";

export interface RejectedSignal {
  signal: CandidateSignal;
  reason: string;
  rule: string;
}

export interface PipelineResult {
  opportunities: ScoredOpportunity[];
  rejected: RejectedSignal[];
  duplicates: number;
  observed: number;
}

const SUPPLY_SIDE_PATTERNS: Array<{ rule: string; test: RegExp; reason: string }> = [
  {
    rule: "supply-side post",
    test: /\[\s*for hire\s*\]|available for (work|hire)|i(?:'m| am) a (?:senior |full[- ]stack |freelance )?(?:developer|designer|engineer)/i,
    reason: "This is someone selling their own services, not buying.",
  },
  {
    // Catches "I've been building marketing agents for three years" and similar
    // — the author is describing their own product, not buying ours.
    rule: "supply-side post",
    test: /i(?:'ve| have) been (?:building|creating|developing|running|shipping) (?:\w+ ){0,2}(?:agents?|bots?|tools?|systems?|apps?|software|platforms?|services?|automation)/i,
    reason: "The author describes building their own product or service, not buying.",
  },
  {
    rule: "promotional post",
    test: /guaranteed results|limited spots|dm me the word|print money|while you sleep|no experience needed/i,
    reason: "Promotional or spam language — nothing to pursue.",
  },
  {
    rule: "unpaid work",
    test: /\bunpaid\b|for exposure|revenue share only|commission only/i,
    reason: "Unpaid or commission-only work is outside the service profile.",
  },
  {
    rule: "too thin",
    test: /^$/i,
    reason: "Not enough content to evaluate.",
  },
];

export function fingerprintSignal(signal: CandidateSignal): string {
  const basis = signal.sourceObjectId || normalize(signal.content).slice(0, 200);
  return createHash("sha256").update(basis).digest("hex").slice(0, 16);
}

export function contentFingerprint(signal: CandidateSignal): string {
  return createHash("sha256")
    .update(normalize(signal.content).slice(0, 280))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Cheap filtering funnel. Everything expensive (models, research, scoring)
 * runs only on what survives this stage.
 */
export function filterSignals(
  signals: CandidateSignal[],
  profile: ServiceProfile,
): { kept: CandidateSignal[]; rejected: RejectedSignal[] } {
  const kept: CandidateSignal[] = [];
  const rejected: RejectedSignal[] = [];

  for (const signal of signals) {
    const text = `${signal.title} ${signal.content}`;
    const normalized = normalize(text);

    // Whole words only, so a blocked pattern like "ai" cannot fire on
    // "available" or "email".
    const negative = profile.negativeSignals.find((pattern) => termPattern(pattern).test(normalized));
    if (negative) {
      rejected.push({
        signal,
        rule: "negative pattern",
        reason: `Matches a blocked pattern in your profile: “${negative}”.`,
      });
      continue;
    }

    const matchedRule = SUPPLY_SIDE_PATTERNS.find((entry) => entry.test.test(text));
    if (matchedRule && matchedRule.rule !== "too thin") {
      rejected.push({ signal, rule: matchedRule.rule, reason: matchedRule.reason });
      continue;
    }

    if (wordCount(signal.content) < 60) {
      rejected.push({
        signal,
        rule: "too thin",
        reason: `Only ${wordCount(signal.content)} words — not enough detail to qualify.`,
      });
      continue;
    }

    // Require at least one watch keyword from the service profile. Without
    // this gate, any long post that dodges the supply-side patterns can score
    // into Watch purely from freshness and reachability — no topic relevance
    // required. Only applied when the profile has keywords configured.
    if (profile.keywords.length > 0) {
      const hasKeyword = profile.keywords.some((kw) =>
        normalized.includes(kw.toLowerCase()),
      );
      if (!hasKeyword) {
        rejected.push({
          signal,
          rule: "no-keyword-match",
          reason: "None of your watch keywords appear in this post.",
        });
        continue;
      }
    }

    kept.push(signal);
  }

  return { kept, rejected };
}

export function dedupeSignals(signals: CandidateSignal[]): {
  unique: CandidateSignal[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: CandidateSignal[] = [];
  let duplicates = 0;
  for (const signal of signals) {
    const key = contentFingerprint(signal);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(signal);
  }
  return { unique, duplicates };
}

function summarizeIntent(checks: ScoredOpportunity["intent"]["checks"], band: string): string {
  const passing = checks.filter((check) => check.status === "pass").map((check) => check.label);
  if (passing.length === 0) return `${band} intent — the request is implied rather than stated.`;
  return `${band} intent — ${passing.slice(0, 3).join("; ")}.`;
}

function matchReasonFor(category: OpportunityCategory, categories: string[], score: number): string {
  const basis = categories.length > 0 ? `the request language (${categories.slice(0, 4).join(", ")})` : "the post language";
  return `Surfaced because ${basis} matches your ${categoryLabel(category).toLowerCase()} offering, and the weighted fit/intent/urgency/reachability score came to ${score}.`;
}

/** The full pipeline: score -> qualify -> research -> strategise. Pure. */
export function buildOpportunities(
  signals: CandidateSignal[],
  profile: ServiceProfile,
  now: Date = new Date(),
): PipelineResult {
  const observed = signals.length;
  const { kept, rejected } = filterSignals(signals, profile);
  const { unique, duplicates } = dedupeSignals(kept);

  const scored = unique.map((signal) => {
    const dimensions = scoreSignal(signal, profile, now);
    const qualification = qualify(signal, dimensions, dimensions.score, dimensions.risks);
    const strategy = buildStrategy(signal, dimensions, qualification, now);
    const nextAction = buildNextAction(signal, dimensions, qualification, now);
    const intentBand =
      dimensions.intent.band === "high" ? "Strong" : dimensions.intent.band === "medium" ? "Moderate" : "Weak";

    return {
      id: `opp_${fingerprintSignal(signal)}`,
      signal,
      category: dimensions.category.category,
      needSummary: keywordExcerpt(signal.title, signal.content),
      intentSummary: summarizeIntent(dimensions.intent.checks, intentBand),
      fit: dimensions.fit,
      intent: dimensions.intent,
      urgency: dimensions.urgency,
      reachability: dimensions.reachability,
      score: dimensions.score,
      band: dimensions.band,
      reasons: dimensions.reasons,
      risks: dimensions.risks,
      qualification,
      strategy,
      nextAction,
      matchReason: matchReasonFor(dimensions.category.category, dimensions.category.matched, dimensions.score),
    } satisfies ScoredOpportunity;
  });

  // Signals that cleared the filter funnel but scored below Watch are not
  // actionable — they have keyword overlap but no real buying signal. Surface
  // them as rejected so they appear in the Filtered Out view rather than
  // cluttering the opportunity queue.
  const belowThreshold: RejectedSignal[] = scored
    .filter((opp) => opp.score < 52)
    .map((opp) => ({
      signal: opp.signal,
      rule: "low-score",
      reason: `Score ${opp.score} — below the Watch threshold. Keyword match but no clear buying intent.`,
    }));

  const opportunities = scored
    .filter((opp) => opp.score >= 52)
    .sort((a, b) => b.score - a.score);

  return { opportunities, rejected: [...rejected, ...belowThreshold], duplicates, observed };
}
