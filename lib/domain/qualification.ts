import { extractMoney, normalize, sentenceCount, uppercaseRatio, wordCount } from "./text";
import type { CandidateSignal, DimensionScore, Qualification } from "./types";

const SPAM_MARKERS = [
  "guaranteed", "limited spots", "dm me the word", "print money", "no experience needed",
  "results guaranteed", "while you sleep", "100% free", "click the link", "crypto",
];

const DEMAND_MARKERS = [
  "i need", "we need", "looking for", "hiring", "we want", "i want", "our team",
  "budget", "deliverable", "scope", "timeline",
];

const SUPPLY_MARKERS = [
  "for hire", "available for work", "i am a developer", "my services",
  "i offer", "portfolio available", "open to work", "dm me with your project",
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
    notes.push(`Very short post (${words} words) — not enough detail to qualify.`);
  } else if (words < 120) {
    score -= 10;
    notes.push(`Brief post (${words} words) — scope will need clarifying on the call.`);
  } else {
    notes.push(`${words} words of specific detail — consistent with a genuine request.`);
  }

  const spamHits = SPAM_MARKERS.filter((marker) => text.includes(marker));
  if (spamHits.length > 0) {
    score -= 35 * spamHits.length;
    notes.push(`Promotional language detected: ${spamHits.join(", ")}.`);
  }

  const demandHits = DEMAND_MARKERS.filter((marker) => text.includes(marker)).length;
  const supplyHits = SUPPLY_MARKERS.filter((marker) => text.includes(marker)).length;
  if (demandHits > supplyHits) {
    notes.push("Framed as a buyer describing a need, not a seller advertising.");
  } else if (supplyHits > 0) {
    score -= 30;
    notes.push("Framed as someone selling their own services.");
  }

  if (sentenceCount(signal.content) >= 4) {
    notes.push("Multiple structured paragraphs — hard to fake cheaply.");
  } else {
    score -= 10;
    notes.push("Single thought — limited structure to verify.");
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

const UNKNOWN_CHECKS: Array<{ match: (checks: DimensionScore["checks"]) => boolean; text: string }> = [
  {
    match: (checks) => checks.some((check) => check.label.includes("Budget not stated")),
    text: "Budget range and approval path.",
  },
  {
    match: (checks) => checks.some((check) => check.label.includes("Decision authority unclear")),
    text: "Who signs off — the author or someone above them.",
  },
  {
    match: (checks) => checks.some((check) => check.label.includes("No deadline given")),
    text: "When they want to start and what “done” means to them.",
  },
  {
    match: (checks) => checks.some((check) => check.label.includes("No contact channel named")),
    text: "Preferred channel and whether a call is welcome.",
  },
  {
    match: (checks) => checks.some((check) => check.label.includes("No public history reviewed")),
    text: "Company context beyond what the post states.",
  },
];

export function qualify(
  signal: CandidateSignal,
  dimensions: { fit: DimensionScore; intent: DimensionScore; urgency: DimensionScore; reachability: DimensionScore },
  score: number,
  risks: string[],
): Qualification {
  const authenticity = assessAuthenticity(signal);
  const allChecks = [
    ...dimensions.fit.checks,
    ...dimensions.intent.checks,
    ...dimensions.urgency.checks,
    ...dimensions.reachability.checks,
  ];

  const whyQualified = [
    dimensions.fit.checks.find((check) => check.status === "pass")?.detail,
    dimensions.intent.checks.find((check) => check.status === "pass")?.detail,
    dimensions.urgency.checks.find((check) => check.status === "pass")?.detail,
  ].filter((value): value is string => Boolean(value));

  const unknowns = UNKNOWN_CHECKS.filter((entry) => entry.match(allChecks)).map((entry) => entry.text);

  const verdict: Qualification["verdict"] =
    score >= 78 && authenticity.score >= 70
      ? "QUALIFIED"
      : score >= 62 || authenticity.score >= 65
        ? "NEEDS_REVIEW"
        : "WEAK";

  const confidence = Math.round(
    Math.min(95, score * 0.6 + authenticity.score * 0.25 + (unknowns.length === 0 ? 15 : Math.max(0, 15 - unknowns.length * 4))),
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
