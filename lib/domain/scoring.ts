import { categoryLabel, detectCategory } from "./category";
import { capabilityTerms, operatorStack } from "./service-profile";
import { ageInHours, extractMoney, matchedTerms, normalize, sentenceCount } from "./text";
import type {
  CandidateSignal,
  DimensionScore,
  ScoreCheck,
  ServiceProfile,
} from "./types";

const EXPLICIT_REQUEST_PHRASES = [
  "looking for", "need someone", "need a dev", "hiring", "we want", "i want",
  "looking to hire", "want to hire", "would pay", "who can", "anyone know a dev",
  "looking to partner", "we need", "i need", "seeking", "contractor", "freelancer",
  "consultant", "would rather pay",
];

const AUTHORITY_PHRASES = [
  "i'm the founder", "i am the founder", "our team", "we're a", "my company",
  "i run", "we run", "our cto", "i own", "we are a", "our agency", "our ops",
];

const TIMELINE_PHRASES = [
  "asap", "this week", "within a month", "next week", "deadline", "timeline",
  "start in", "start within", "starts in", "in six weeks", "in 3 weeks",
  "q4", "urgent", "by friday", "end of the month", "open to start",
];

const PAIN_PHRASES = [
  "nightmare", "bottleneck", "manually", "by hand", "takes a full day",
  "eats", "scared to", "nobody can explain", "still finds discrepancies",
  "three spreadsheets", "by a prayer", "burned", "waste", "overwhelmed",
];

const CONTACT_PHRASES = [
  "dm me", "dm you", "send me", "email", "get on a call", "hop on a call",
  "happy to chat", "reply here", "comment below", "book a call", "happy to get on a call",
];

const INVITE_PHRASES = [
  "happy to get on a call", "show you", "send examples", "examples of sites",
  "tell us which", "get on a call", "hop on a call", "happy to chat", "references",
];

function bandOf(value: number): DimensionScore["band"] {
  if (value >= 78) return "high";
  if (value >= 58) return "medium";
  return "low";
}

const STATUS_WEIGHT: Record<ScoreCheck["status"], number> = { pass: 1, unknown: 0.5, warn: 0 };

function dimension(summary: (value: number) => string, checks: ScoreCheck[]): DimensionScore {
  const total = checks.reduce((sum, check) => sum + check.weight, 0) || 1;
  const earned = checks.reduce(
    (sum, check) => sum + check.weight * STATUS_WEIGHT[check.status],
    0,
  );
  const value = Math.round((earned / total) * 100);
  return { value, band: bandOf(value), summary: summary(value), checks };
}

export interface ScoredDimensions {
  fit: DimensionScore;
  intent: DimensionScore;
  urgency: DimensionScore;
  reachability: DimensionScore;
  score: number;
  band: "High" | "Strong" | "Watch" | "Low";
  reasons: string[];
  risks: string[];
  category: ReturnType<typeof detectCategory>;
}

export function bandForScore(score: number): "High" | "Strong" | "Watch" | "Low" {
  if (score >= 82) return "High";
  if (score >= 68) return "Strong";
  if (score >= 52) return "Watch";
  return "Low";
}

const FRESHNESS_STEPS: Array<[number, number]> = [
  [12, 100],
  [24, 92],
  [48, 80],
  [72, 68],
  [120, 52],
  [168, 40],
  [336, 26],
];

export function freshnessScore(publishedAt: string, now: Date = new Date()): number {
  const hours = ageInHours(publishedAt, now);
  for (const [limit, value] of FRESHNESS_STEPS) {
    if (hours <= limit) return value;
  }
  return 15;
}

/** Deterministic, evidence-based scoring. Every number traces to a check. */
export function scoreSignal(
  signal: CandidateSignal,
  profile: ServiceProfile,
  now: Date = new Date(),
): ScoredDimensions {
  const text = normalize(`${signal.title} ${signal.content}`);
  const category = detectCategory(signal.title, signal.content);

  const matchedCapabilities = profile.capabilities.filter((capability) => {
    const terms = capabilityTerms[capability] ?? [];
    return terms.some((term) => text.includes(term));
  });

  const stackMatches = matchedTerms(text, operatorStack);
  const money = extractMoney(`${signal.title} ${signal.content}`);
  const minimum = extractMoney(profile.minimumEngagement ?? "") ?? 0;
  const questions = (signal.content.match(/\?/g) ?? []).length;
  const numbers = (signal.content.match(/\b\d[\d,]*\b/g) ?? []).length;

  const fit: DimensionScore = dimension(
    (value) =>
      value >= 78
        ? "Core service match — this is the work you do best."
        : value >= 58
          ? "Partial match — adjacent to your service with a gap to close."
          : "Weak service match — pursuing this needs a reason to say yes.",
    [
      {
        label: `${matchedCapabilities.length} of ${profile.capabilities.length} capabilities requested`,
        status: matchedCapabilities.length >= 3 ? "pass" : matchedCapabilities.length >= 2 ? "unknown" : "warn",
        weight: 4,
        detail:
          matchedCapabilities.length > 0
            ? `Matched: ${matchedCapabilities.join(", ")}.`
            : "No capability in your service profile appears in the request.",
      },
      {
        label: `Category: ${categoryLabel(category.category)}`,
        status: category.score >= 3 ? "pass" : category.score >= 1 ? "unknown" : "warn",
        weight: 1.5,
        detail:
          category.matched.length > 0
            ? `Evidence: ${category.matched.slice(0, 6).join(", ")}.`
            : "No category language detected.",
      },
      {
        label:
          numbers >= 3
            ? `Concrete requirement (${numbers} specifics)`
            : "Requirement is described in general terms",
        status: numbers >= 3 ? "pass" : "unknown",
        weight: 2,
        detail: "Counts the standalone numbers in the post — prices, volumes and times a vague request carries none of.",
      },
      {
        label:
          stackMatches.length > 0
            ? `Stack overlap: ${stackMatches.slice(0, 5).join(", ")}`
            : "No overlap with your stack named",
        status: stackMatches.length >= 2 ? "pass" : stackMatches.length === 1 ? "unknown" : "warn",
        weight: 2,
        detail: "Named technologies you already ship with reduce delivery risk.",
      },
      {
        label: money === null ? "Budget not stated" : `Budget stated: $${money.toLocaleString()}`,
        status: money === null ? "unknown" : money >= minimum ? "pass" : "warn",
        weight: 2,
        detail:
          money === null
            ? "No figure given — qualifying the budget is the first job."
            : money >= minimum
              ? `At or above your minimum engagement (${profile.minimumEngagement}).`
              : `Below your minimum engagement (${profile.minimumEngagement}).`,
      },
    ],
  );

  const requestHits = matchedTerms(text, EXPLICIT_REQUEST_PHRASES);
  const intent: DimensionScore = dimension(
    (value) =>
      value >= 78
        ? "Explicit buying intent with a defined scope."
        : value >= 58
          ? "Clear interest, but the scope or commitment is soft."
          : "Interest is implied rather than stated.",
    [
      {
        label: requestHits.length > 0 ? "Explicit request for help" : "No direct request language",
        status: requestHits.length > 0 ? "pass" : "warn",
        weight: 3,
        detail: requestHits.length > 0 ? `Phrasing: "${requestHits.slice(0, 3).join('", "')}".` : "Reads like a discussion, not a hiring post.",
      },
      {
        label:
          sentenceCount(signal.content) >= 5 && numbers >= 2
            ? "Scope is spelled out (deliverables + constraints)"
            : "Scope is loosely described",
        status: sentenceCount(signal.content) >= 5 && numbers >= 2 ? "pass" : "unknown",
        weight: 2.5,
        detail: "Long-form detail with constraints is the strongest predictor of a real project.",
      },
      {
        label: money === null ? "Budget authority unknown" : "Budget discussed openly",
        status: money === null ? "unknown" : "pass",
        weight: 1.5,
        detail: money === null ? "Nothing indicates an approved budget." : "Naming a number signals an approved budget.",
      },
      {
        label: matchedTerms(text, AUTHORITY_PHRASES).length > 0 ? "Decision-maker voice" : "Decision authority unclear",
        status: matchedTerms(text, AUTHORITY_PHRASES).length > 0 ? "pass" : "unknown",
        weight: 1.5,
        detail: '"We run / I own / our team" indicates the author can approve work.',
      },
      {
        label: matchedTerms(text, PAIN_PHRASES).length > 0 ? "Cost of inaction described" : "Cost of inaction not quantified",
        status: matchedTerms(text, PAIN_PHRASES).length > 0 ? "pass" : "unknown",
        weight: 1.5,
        detail: "Describing manual hours, fear or drift means the pain is already expensive.",
      },
      {
        label: matchedTerms(text, TIMELINE_PHRASES).length > 0 ? "Timing mentioned" : "No timing mentioned",
        status: matchedTerms(text, TIMELINE_PHRASES).length > 0 ? "pass" : "unknown",
        weight: 1,
        detail: 'Timing is commitment: it separates "someday" from "this quarter".',
      },
    ],
  );

  const fresh = freshnessScore(signal.publishedAt, now);
  const hours = Math.round(ageInHours(signal.publishedAt, now));
  const urgency: DimensionScore = dimension(
    (value) =>
      value >= 78
        ? "Live window — respond now or lose the moment."
        : value >= 58
          ? "Still open, but the window is narrowing."
          : "Older signal — treat as a warm-start, not a live request.",
    [
      {
        label: hours < 24 ? `Posted ${hours}h ago` : `Posted ${Math.round(hours / 24)}d ago`,
        status: fresh >= 80 ? "pass" : fresh >= 50 ? "unknown" : "warn",
        weight: 4,
        detail: "Freshness uses a decay curve: requests are most actionable in the first 48 hours.",
      },
      {
        label: matchedTerms(text, TIMELINE_PHRASES).length > 0 ? "Explicit deadline or start window" : "No deadline given",
        status: matchedTerms(text, TIMELINE_PHRASES).length > 0 ? "pass" : "unknown",
        weight: 2,
        detail: "Stated timelines move a signal from interesting to scheduled.",
      },
      {
        label: questions > 0 ? "Actively soliciting input" : "Stated need, not a question",
        status: "pass",
        weight: 1,
        detail:
          questions > 0
            ? "Questions invite a reply and lower the cost of the first message."
            : "A statement of need is fine — lead with a concrete plan.",
      },
    ],
  );

  const contactHits = matchedTerms(text, CONTACT_PHRASES);
  const reachability: DimensionScore = dimension(
    (value) =>
      value >= 78
        ? "Direct route to the decision-maker."
        : value >= 58
          ? "Reachable with a public reply — no private channel stated."
          : "Route to the person is unclear.",
    [
      {
        label: contactHits.length > 0 ? "Contact preference stated" : "No contact channel named",
        status: contactHits.length > 0 ? "pass" : "warn",
        weight: 3,
        detail:
          contactHits.length > 0
            ? `Signals: "${contactHits.slice(0, 3).join('", "')}".`
            : "Assume a public reply; do not assume a DM is welcome.",
      },
      {
        label: matchedTerms(text, INVITE_PHRASES).length > 0 ? "Author invites a conversation" : "No explicit invitation",
        status: matchedTerms(text, INVITE_PHRASES).length > 0 ? "pass" : "unknown",
        weight: 2,
        detail: "An invitation to talk shortens the path from reply to call.",
      },
      {
        label: signal.author.publicContext?.length ? "Public history available" : "No public history reviewed",
        status: signal.author.publicContext?.length ? "pass" : "unknown",
        weight: 1.5,
        detail: signal.author.publicContext?.length
          ? `${signal.author.publicContext.length} prior observations give context for personalisation.`
          : "Context must come from the post itself.",
      },
      {
        label: signal.sourceKind === "reddit" ? `Public channel: ${signal.sourceName}` : "Public channel",
        status: "pass",
        weight: 1.5,
        detail: "Reply in the same place the request was made — it is verifiable and low-pressure.",
      },
    ],
  );

  const score = Math.round(
    fit.value * 0.35 + intent.value * 0.3 + urgency.value * 0.2 + reachability.value * 0.15,
  );

  const reasons = [
    ...fit.checks.filter((check) => check.status === "pass").map((check) => check.label),
    ...intent.checks.filter((check) => check.status === "pass").map((check) => check.label),
    ...urgency.checks.filter((check) => check.status === "pass").map((check) => check.label),
    ...reachability.checks.filter((check) => check.status === "pass").map((check) => check.label),
  ].slice(0, 5);

  const risks = [
    ...fit.checks.filter((check) => check.status === "warn").map((check) => check.label),
    ...intent.checks.filter((check) => check.status === "warn").map((check) => check.label),
    // The freshness warning is the one that says a lead has gone cold, which is
    // exactly what the operator needs to see, so nothing is filtered out here.
    ...urgency.checks.filter((check) => check.status === "warn").map((check) => check.label),
  ];

  return {
    fit,
    intent,
    urgency,
    reachability,
    score,
    band: bandForScore(score),
    reasons,
    risks,
    category,
  };
}
