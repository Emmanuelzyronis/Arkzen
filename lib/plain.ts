import type { Activity, OpportunityStatus, OutcomeKind } from "@/lib/domain/types";
import type { RunStatus } from "@/lib/sources/types";

/**
 * The words the interface actually shows. Internals stay in the domain layer;
 * operators read this. Keep every label here so the vocabulary stays consistent
 * across pages, buttons, empty states and toasts.
 */
const STATUS_LABEL: Record<OpportunityStatus, string> = {
  NEW: "New",
  REVIEWING: "Needs a look",
  QUALIFIED: "Worth pursuing",
  ACTIVE: "In progress",
  WON: "Won",
  LOST: "Lost",
  UNKNOWN: "Not set",
};

const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  NO_RESPONSE: "No reply",
  REPLIED: "Replied",
  CONVERSATION: "Talking",
  MEETING: "Meeting booked",
  PROPOSAL: "Proposal sent",
  WON: "Won",
  LOST: "Lost",
  DISQUALIFIED: "Not a fit",
  UNREACHABLE: "Couldn't reach them",
};

export function statusLabel(status: OpportunityStatus): string {
  return STATUS_LABEL[status] ?? status;
}

export function outcomeLabel(outcome: OutcomeKind): string {
  return OUTCOME_LABEL[outcome] ?? outcome;
}

export function bandLabel(band: string): string {
  if (band === "High") return "Strong match";
  if (band === "Strong") return "Good match";
  if (band === "Watch") return "Worth a look";
  return "Weak match";
}

/**
 * The readable name of a place opportunities come from.
 *
 * Source rows carry an adapter id — `reddit-oauth`, `arkzen-reviewed-corpus`
 * — which is an implementation detail and must never reach the screen. Anything
 * unmapped degrades to title case rather than showing the raw id, so a newly
 * added source reads as "Hacker News" instead of "hn-algolia".
 */
const SOURCE_LABEL: Record<string, string> = {
  "reddit-oauth": "Reddit",
  "reddit-public-json": "Reddit", // legacy id — kept so old DB rows still display correctly
  "hn-who-is-hiring": "Hacker News",
  "arkzen-reviewed-corpus": "Reviewed captures",
};

export function sourceLabel(providerId: string): string {
  if (SOURCE_LABEL[providerId]) return SOURCE_LABEL[providerId];
  return titleCase(providerId);
}

/**
 * A matcher's term, re-cased for reading. The fallback for anything unmapped:
 * never the raw string, because these are written lowercase and hyphenated for
 * matching, not for reading.
 */
function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Why a post was dropped, in the reader's words.
 *
 * `negativeSignals` is a *matcher vocabulary*, and rendering it directly puts
 * the matcher on screen. The array holds lowercase fragments — and holds two
 * spellings of the same rule, `equity only` and `equity-only`, so a raw list
 * shows the same thing twice and looks like a bug. Neither is a sentence anyone
 * wrote for a reader.
 *
 * Deduplicating on the *label* rather than the term is what collapses those
 * variants: two terms that mean the same thing produce the same sentence and
 * one pill. A rule whose terms differ keeps both, which is correct — they are
 * genuinely different rules.
 *
 * An unmapped term still reaches the screen, title-cased, rather than being
 * dropped. These rules decide which leads a person never sees; silently hiding
 * one because nobody wrote it a sentence yet would be the worse failure.
 */
const BLOCKED_REASON: Record<string, string> = {
  "equity only": "Paid only in equity",
  "equity-only": "Paid only in equity",
  unpaid: "Unpaid work",
  "commission only": "Paid only on commission",
  "revenue share": "Paid only as a share of revenue",
  "no budget right now": "No budget yet",
  "for exposure": "Paid in exposure rather than money",
};

export function blockedReasonLabels(terms: string[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const term of terms) {
    const label = BLOCKED_REASON[term] ?? titleCase(term);
    if (seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

/**
 * What went wrong with a search, in plain words — or `null` when nothing did.
 *
 * `RunStatus` values are internal identifiers: `PARTIAL_SUCCESS`, `RATE_LIMITED`,
 * `NORMALIZATION_ERROR`. They belong in the run report the API returns and
 * nowhere an operator can see. The glossary in `docs/REDESIGN.md` already fixes
 * the shape of this sentence — "Reddit blocked the search" — and every entry
 * below is written to complete "{source} …" the same way.
 *
 * `SUCCESS` and `PARTIAL_SUCCESS` are deliberately absent rather than mapped to
 * a phrase like "went fine": a search that worked is described by what it found,
 * not by a status word, so the caller gets `null` and says nothing about it. The
 * partial record is what makes that absence a decision instead of an oversight —
 * and a `RunStatus` added later will not type-check until someone decides which
 * of the two it is.
 */
const RUN_PROBLEM: Partial<Record<RunStatus, string>> = {
  TIMEOUT: "took too long to answer",
  RATE_LIMITED: "asked us to slow down",
  ACCESS_RESTRICTED: "wouldn't let us search",
  PROVIDER_ERROR: "was unavailable",
  INVALID_RESPONSE: "sent back something we couldn't read",
  NORMALIZATION_ERROR: "sent back something we couldn't read",
};

export function runProblemLabel(status: string): string | null {
  return RUN_PROBLEM[status as RunStatus] ?? null;
}

/** "1,284" — grouping only, no currency or unit assumptions. */
export function count(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Change between two periods, or `null` when there is nothing to compare
 * against. Returning null (rather than 0 or 100) is deliberate: a card must
 * never imply a trend that the data cannot support.
 */
export function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null },
] as const;

export function rangeLabel(value: string | undefined): string {
  return RANGE_OPTIONS.find((option) => option.value === value)?.label ?? "Last 7 days";
}

export function rangeStart(value: string | undefined, now = new Date()): Date | null {
  const option = RANGE_OPTIONS.find((entry) => entry.value === value) ?? RANGE_OPTIONS[0];
  if (option.days === null) return null;
  const start = new Date(now);
  start.setDate(start.getDate() - option.days);
  return start;
}

/**
 * What happened, in a word — the timeline's left column.
 *
 * These are `Activity["kind"]` values: `AI_RECOMMENDATION`, `STATUS_CHANGE`.
 * Shouting those at an operator is the same failure as showing a raw provider id.
 */
const ACTIVITY_LABEL: Record<Activity["kind"], string> = {
  DISCOVERED: "Found",
  STATUS_CHANGE: "Stage changed",
  NOTE: "Note",
  ACTION: "Action",
  MESSAGE: "Message sent",
  REPLY: "Reply",
  AI_RECOMMENDATION: "Suggestion",
  OUTCOME: "Outcome",
};

export function activityLabel(kind: Activity["kind"]): string {
  return ACTIVITY_LABEL[kind] ?? kind;
}

/**
 * Who did it, from the operator's point of view.
 *
 * "You" rather than "Operator" because the person reading this is the operator,
 * and "They" rather than "Prospect" for the other side of a conversation.
 */
const ACTOR_LABEL: Record<Activity["actor"], string> = {
  arkzen: "Arkzen",
  operator: "You",
  prospect: "They",
};

export function actorLabel(actor: Activity["actor"]): string {
  return ACTOR_LABEL[actor] ?? actor;
}

/**
 * Who wrote an answer.
 *
 * `"arkzen-reasoning"` is the internal id for the built-in path and reads as
 * nothing at all to an operator; a configured provider shows up as its own id.
 * Both are mapped, and an unknown one degrades to title case the same way
 * `sourceLabel` handles a source it has never seen.
 */
const PROVIDER_LABEL: Record<string, string> = {
  "arkzen-reasoning": "ArkZen's own reasoning",
  operator: "You",
};

export function providerLabel(provider: string): string {
  if (PROVIDER_LABEL[provider]) return PROVIDER_LABEL[provider];
  return provider
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
