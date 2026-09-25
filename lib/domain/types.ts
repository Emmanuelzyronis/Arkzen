/**
 * Arkzen domain model.
 *
 * The pipeline is:  capture -> discover -> filter -> score -> qualify -> research
 *                   -> strategise -> engage -> outcome
 *
 * Everything a human sees in the UI is derived from an Opportunity, and every
 * derived value carries the reasoning that produced it (score checks, evidence
 * references, grounding notes). No hidden magic.
 */

export type SourceKind = "reddit" | "job-board" | "community" | "web" | "demo";

/** Shape returned by the AI deal partner, provider-backed or deterministic. */
export interface PartnerResponse {
  headline: string;
  recommendation: string;
  rationale: string[];
  grounding: string[];
  suggestedMessage: string | null;
  objections: Array<{ objection: string; likelihood: string; response: string }>;
  nextActions: Array<{ action: string; why: string }>;
  confidence: "high" | "medium";
  provider: string;
  mode: "provider" | "deterministic";
  /** Set when an AI provider is configured but could not be reached. */
  providerNote?: string | null;
}

export type OpportunityStatus =
  | "NEW"
  | "REVIEWING"
  | "QUALIFIED"
  | "ACTIVE"
  | "WON"
  | "LOST"
  | "UNKNOWN";

export type OutcomeKind =
  | "NO_RESPONSE"
  | "REPLIED"
  | "CONVERSATION"
  | "MEETING"
  | "PROPOSAL"
  | "WON"
  | "LOST"
  | "DISQUALIFIED"
  | "UNREACHABLE";

export type DataKind = "live" | "seeded";

/** A person as observed in public data. Never assumed. */
export interface SignalAuthor {
  handle: string;
  displayName?: string;
  role?: string;
  org?: string;
  /** Public context observed on the profile: history, location, prior posts. */
  publicContext?: string[];
}

/**
 * A transient normalized object returned by an acquisition adapter.
 * Candidate signals are cheap; Evidence is durable.
 */
export interface CandidateSignal {
  /** Stable id of the upstream object, e.g. `reddit:1abc23`. */
  sourceObjectId: string;
  sourceKind: SourceKind;
  sourceName: string;
  canonicalUrl: string;
  title: string;
  content: string;
  author: SignalAuthor;
  publishedAt: string;
  capturedAt: string;
  providerId: string;
  /** Where this signal came from, and how to reproduce it. */
  provenance: Record<string, string>;
  dataKind: DataKind;
  meta?: Record<string, string | number | boolean>;
}

/**
 * ArkZen is a lead-gen tool: find people publicly saying they want to hire
 * or buy something, then reach out while that want is still live.
 * Sources: community threads, forums, social posts with buying-intent signals.
 */
export type WorkspaceMode = "lead-gen";

/** What the operator sells — the lens every signal is scored against. */
export interface ServiceProfile {
  id: string;
  name: string;
  /** Plain language: "AI-assisted internal tools and automation for small teams". */
  description: string;
  capabilities: string[];
  keywords: string[];
  negativeSignals: string[];
  locations: string[];
  minimumEngagement?: string;
  mode?: WorkspaceMode;
}

export type CheckStatus = "pass" | "warn" | "unknown";

/** One explainable reason behind a score. */
export interface ScoreCheck {
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
}

export interface DimensionScore {
  value: number;
  band: "high" | "medium" | "low";
  summary: string;
  checks: ScoreCheck[];
}

export type OpportunityCategory =
  | "ai-integration"
  | "internal-tools"
  | "automation"
  | "web-app"
  | "backend"
  | "data";

export interface Qualification {
  verdict: "QUALIFIED" | "NEEDS_REVIEW" | "WEAK";
  confidence: number;
  whyQualified: string[];
  risks: string[];
  unknowns: string[];
  authenticity: {
    score: number;
    label: string;
    notes: string[];
  };
}

export interface Objection {
  objection: string;
  likelihood: "likely" | "possible";
  response: string;
}

export interface Strategy {
  approach: string;
  leadWith: string;
  avoid: string;
  objections: Objection[];
  suggestedMessage: string;
  followUpPlan: string[];
  evidenceUsed: string[];
}

export interface NextAction {
  action: string;
  rationale: string;
  channel: string;
  due: string;
}

export interface ScoredOpportunity {
  id: string;
  signal: CandidateSignal;
  category: OpportunityCategory;
  needSummary: string;
  intentSummary: string;
  fit: DimensionScore;
  intent: DimensionScore;
  urgency: DimensionScore;
  reachability: DimensionScore;
  score: number;
  band: "High" | "Strong" | "Watch" | "Low";
  reasons: string[];
  risks: string[];
  qualification: Qualification;
  strategy: Strategy;
  nextAction: NextAction;
  matchReason: string;
}

export interface Activity {
  id: string;
  opportunityId: string;
  kind:
    | "DISCOVERED"
    | "STATUS_CHANGE"
    | "NOTE"
    | "ACTION"
    | "MESSAGE"
    | "REPLY"
    | "AI_RECOMMENDATION"
    | "OUTCOME";
  actor: "arkzen" | "operator" | "prospect";
  summary: string;
  detail?: string | null;
  statusFrom?: OpportunityStatus | null;
  statusTo?: OpportunityStatus | null;
  createdAt: string;
  meta?: Record<string, unknown> | null;
}

export interface PartnerMessage {
  id: string;
  opportunityId: string;
  role: "operator" | "partner";
  content: string;
  /** Structured partner response, persisted so it survives a reload. */
  payload: PartnerResponse | null;
  /** What the recommendation is grounded in. Always populated. */
  grounding: string[];
  provider: string;
  decision?: "accepted" | "edited" | "rejected" | null;
  decisionNote?: string | null;
  createdAt: string;
}

export interface Opportunity extends ScoredOpportunity {
  status: OpportunityStatus;
  outcome: OutcomeKind | null;
  outcomeNote: string | null;
  createdAt: string;
  updatedAt: string;
  activities: Activity[];
  partnerThread: PartnerMessage[];
}
