/** Small, dependency-free text helpers used by the deterministic pipeline. */

export function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function containsAll(text: string, terms: string[]): boolean {
  const haystack = normalize(text);
  return terms.every((term) => haystack.includes(normalize(term)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Term matching with a word-start boundary, plus an end boundary for short
 * terms. Without this, "ai" matches "available" and "email", which would let a
 * single loose keyword distort category detection and fit scoring. A trailing
 * plural is allowed on short terms, so "LLMs" still counts as "llm" without
 * "llmxxx" counting.
 */
export function termPattern(term: string): RegExp {
  const normalized = normalize(term);
  const escaped = escapeRegExp(normalized);
  const suffix = normalized.length <= 4 ? "s?(?![a-z0-9])" : "";
  return new RegExp(`(^|[^a-z0-9])${escaped}${suffix}`, "i");
}

export function matchedTerms(text: string, terms: string[]): string[] {
  const haystack = normalize(text);
  return terms.filter((term) => termPattern(term).test(haystack));
}

export function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

const MONEY_RANGE = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?[-–—]\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?/gi;
const MONEY_SINGLE = /\$\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)?|\b(\d[\d,]*)\s?(k|m)\s?(?:usd|dollars|per hour|\/hr|a month|per month|fixed|budget)/gi;
const BARE_RANGE = /\b(\d[\d,]*(?:\.\d+)?)\s?(k|m)?\s?(?:[-–—]|\bto\b|\band\b)\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m)\b/gi;
const BARE_SINGLE = /\b(\d[\d,]*(?:\.\d+)?)\s?(k|m)\b/gi;

/**
 * Words that mark the figures beside them as the budget. "spend" is
 * deliberately absent: a post's existing spend is its own cost, not the money
 * on offer, and those figures tend to be the largest in the text.
 */
const BUDGET_LANGUAGE = /\b(budget|budgeted|pay|paying|price|pricing|quote|rate|fee|range|afford)\b/gi;

/** How close an unmarked figure has to sit to budget language to count. */
const BARE_REACH = 24;

interface Span {
  start: number;
  end: number;
}

interface MoneyFigure extends Span {
  value: number;
}

function expand(value: number, suffix: string | undefined): number {
  const factor = (suffix ?? "").toLowerCase();
  if (factor === "k") return value * 1000;
  if (factor === "m") return value * 1_000_000;
  return value;
}

function toFigure(
  raw: string | undefined,
  suffix: string | undefined,
  start: number,
  end: number,
): MoneyFigure | null {
  const value = expand(Number.parseFloat((raw ?? "").replace(/,/g, "")), suffix);
  return Number.isNaN(value) ? null : { value, start, end };
}

/** Figures written with a currency symbol, always worth reading. */
function symbolFigures(text: string): MoneyFigure[] {
  const figures: MoneyFigure[] = [];
  const push = (figure: MoneyFigure | null) => {
    if (figure) figures.push(figure);
  };

  for (const match of text.matchAll(MONEY_RANGE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    push(toFigure(match[2], match[3], start, end));
    push(toFigure(match[1], match[3], start, end));
  }

  for (const match of text.matchAll(MONEY_SINGLE)) {
    const raw = match[1] ?? match[3];
    if (!raw) continue;
    const start = match.index ?? 0;
    push(toFigure(raw, match[2] ?? match[4], start, start + match[0].length));
  }

  return figures;
}

/** Figures with no symbol, e.g. "40k" or "between 40k and 60k". */
function bareFigures(text: string): MoneyFigure[] {
  const figures: MoneyFigure[] = [];
  const push = (figure: MoneyFigure | null) => {
    if (figure) figures.push(figure);
  };

  for (const match of text.matchAll(BARE_RANGE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // The suffix is shared when only one end of the range carries it: "40-60k".
    const suffix = match[4] ?? match[2];
    push(toFigure(match[3], suffix, start, end));
    push(toFigure(match[1], suffix, start, end));
  }

  for (const match of text.matchAll(BARE_SINGLE)) {
    const start = match.index ?? 0;
    push(toFigure(match[1], match[2], start, start + match[0].length));
  }

  return figures;
}

function gapBetween(a: Span, b: Span): number {
  if (b.start >= a.end) return b.start - a.end;
  if (a.start >= b.end) return a.start - b.end;
  return 0;
}

/**
 * Extracts the figure the buyer means by "budget", including "$8-12k" and the
 * unmarked "between 40k and 60k". The top of a range is the buyer's ceiling,
 * so a range reports its upper bound.
 *
 * Figures sitting beside budget language beat the largest number in the post —
 * "we made $2M last year, budget $5k" is a $5k budget. With nothing to anchor
 * on, a lone figure is taken as the budget and several are read as the largest,
 * which is the best guess available.
 */
export function extractMoney(text: string): number | null {
  const anchors: Span[] = [...text.matchAll(BUDGET_LANGUAGE)].map((match) => {
    const start = match.index ?? 0;
    return { start, end: start + match[0].length };
  });

  const bare = bareFigures(text).filter((figure) =>
    anchors.some((anchor) => gapBetween(anchor, figure) <= BARE_REACH),
  );
  const figures = [...symbolFigures(text), ...bare];

  if (figures.length === 0) return null;
  if (figures.length === 1) return figures[0].value;

  const claimed = new Set<MoneyFigure>();
  for (const anchor of anchors) {
    const gaps = figures.map((figure) => gapBetween(anchor, figure));
    const closest = Math.min(...gaps);
    figures.forEach((figure, index) => {
      if (gaps[index] === closest) claimed.add(figure);
    });
  }

  const candidates = claimed.size > 0 ? [...claimed] : figures;
  return Math.max(...candidates.map((figure) => figure.value));
}

export function sentenceCount(text: string): number {
  return text.split(/[.!?]+\s/).filter((sentence) => sentence.trim().length > 0).length;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function uppercaseRatio(text: string): number {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return 0;
  const uppercase = letters.replace(/[^A-Z]/g, "").length;
  return uppercase / letters.length;
}

/**
 * How long ago something happened, in words.
 *
 * Two details matter, and both are about not overstating the passage of time.
 *
 * It floors rather than rounds: 3.9 days reads "3d ago", not "4d ago", because
 * rounding up tells the reader more time has passed than actually has. The old
 * version rounded.
 *
 * It has a below-an-hour tier. The old version started at `Math.max(1, …)`, so a
 * note saved ten seconds ago read "1h ago" — the activity timeline puts this
 * string directly under the action a person just took, and claiming an hour had
 * passed is simply wrong.
 */
export function humanizeAge(isoDate: string, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - new Date(isoDate).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function ageInHours(isoDate: string, now: Date = new Date()): number {
  return Math.max(0, (now.getTime() - new Date(isoDate).getTime()) / 3_600_000);
}

/** A short, quotable fragment of the signal used to keep drafts specific. */
export function keyExcerpt(text: string, maxLength = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentence = clean.split(/(?<=[.!?])\s/).find((s) => s.length > 40) ?? clean;
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1).trimEnd()}…` : sentence;
}

export function titleCase(value: string): string {
  return value
    .split(/[\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "have", "from", "they", "want", "need",
  "looking", "someone", "would", "your", "about", "into", "just", "like", "some", "when",
  "what", "which", "their", "there", "them", "then", "than", "been", "were", "will",
  "we're", "i'm", "it's", "our", "you", "can", "not", "but", "all", "get", "out", "how",
]);

export function keywords(text: string, limit = 8): string[] {
  const counts = new Map<string, number>();
  for (const raw of normalize(text).split(/[^a-z0-9+#.\-]+/)) {
    const word = raw.replace(/^[.\-]+|[.\-]+$/g, "");
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}
