import { extractMoney, normalize, sentenceCount, uppercaseRatio, wordCount } from "./text";
import type { CandidateSignal, DimensionScore, Qualification } from "./types";

const DEMAND_MARKERS = [
  "i need", "we need", "looking for", "hiring", "we want", "i want", "our team",
  "budget", "deliverable", "scope", "timeline",
];

export interface AuthenticityResult {
  score: number;
  label: string;
  notes: string[];
}

/**
 * Cheap, deterministic authenticity checks that run before any model is
 * involved. Their job is to protect the operator's attention and the AI budget.
 */
export function assessAuthenticity(signal: CandidateSignal): AuthenticityResult {
  const text = normalize(`${signal.title} ${signal.content}`);
  const words = wordCount(signal.content);
  const notes: string[] = [];
  let score = 100;

  if (words < 60) {
    score -= 30;
    notes.push(`Very short post (${words} words) -- not enough detail to qualify.`);
  } else if (words < 120) {
    score -= 10;
    notes.push(`Brief post (${words} words) -- scope will need clarifying on the call.`);
  } else {
    notes.push(`${words} words of specific detail -- consistent with a genuine request.`);
  }

  const demandHits = DEMAND_MARKERS.filter((marker) => text.includes(marker)).length;
  if (demandHits >= 2) {
    notes.push("Framed as a buyer describing a need, not a seller advertising.");
  }

  if (sentenceCount(signal.content) >= 4) {
    notes.push("Multiple structured paragraphs -- hard to fake cheaply.");
  } else {
    score -= 10;
    notes.push("Single thought -- limited structure to verify.");
  }

  if (uppercaseRatio(signal.content) > 0.25) {
    score -= 15;
    notes.push("Heavy use of capitals, common in promotional posts.");
  }

  if (extractMoney(`${signal.title} ${signal.content}`) !== null) {
    notes.push("Names a budget, which raises the cost of the manipulation.");
  }

  const clamped = Math.max(0, Math.min(100, score));
  const label = clamped >= 85 ? "High confidence genuine" : clamped >= 65 ? "Probably genuine" : "Treat with caution";
  return { score: clamped, label, notes };
}

/** Build the list of open questions directly from the signal -- no label string matching. */
function deriveUnknowns(
  signal: CandidateSignal,
  dimensions: {
    fit: DimensionScore;
    intent: DimensionScore;
    urgency: DimensionScore;
    reachability: DimensionScore;
  },
): string[] {
  const unknowns: string[] = [];

  const hasBudget = extractMoney(`${signal.title} ${signal.content}`) !== null;
  if (!hasBudget) unknowns.push("Budget range and approval path.");

  const hasAuthority = dimensions.intent.checks.some(
    (c) => c.status === "pass" && c.detail.includes("approve"),
  );
  if (!hasAuthority) unknowns.push("Who signs off -- the author or someone above them.");

  const hasTimeline = dimensions.urgency.checks.some(
    (c) => c.status === "pass" && c.weight === 2,
  );
  if (!hasTimeline) unknowns.push('When they want to start and what "done" means to them.');

  const hasContact = dimensions.reachability.checks.some(
    (c) => c.status === "pass" && c.weight === 3,
  );
  if (!hasContact) unknowns.push("Preferred channel and whether a call is welcome.");

  const hasHistory = Boolean(signal.author.publicContext?.length);
  if (!hasHistory) unknowns.push("Company context beyond what the post states.");

  return unknowns;
}

export function qualify(
  signal: CandidateSignal,
  dimensions: {
    fit: DimensionScore;
    intent: DimensionScore;
    urgency: DimensionScore;
    reachability: DimensionScore;
  },
  score: number,
  risks: string[],
): Qualification {
  const authenticity = assessAuthenticity(signal);
  const whyQualified = [
    dimensions.fit.checks.find((check) => check.status === "pass")?.detail,
    dimensions.intent.checks.find((check) => check.status === "pass")?.detail,
    dimensions.urgency.checks.find((check) => check.status === "pass")?.detail,
  ].filter((value): value is string => Boolean(value));

  const unknowns = deriveUnknowns(signal, dimensions);

  const verdict: Qualification["verdict"] =
    score >= 78 && authenticity.score >= 70
      ? "QUALIFIED"
      : score >= 62 || authenticity.score >= 65
        ? "NEEDS_REVIEW"
        : "WEAK";

  const confidence = Math.round(
    Math.min(
      95,
      score * 0.6 +
        authenticity.score * 0.25 +
        (unknowns.length === 0 ? 15 : Math.max(0, 15 - unknowns.length * 4)),
    ),
  );

  return {
    verdict,
    confidence,
    whyQualified:
      whyQualified.length > 0
        ? whyQualified
        : ["Matched the watch profile language, but the evidence base is thin."],
    risks: risks.length > 0 ? [...new Set(risks)] : ["No material risks detected in the evidence reviewed."],
    unknowns,
    authenticity,
  };
}
