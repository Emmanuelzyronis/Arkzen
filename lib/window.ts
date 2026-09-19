import { RANGE_OPTIONS, rangeLabel, rangeStart } from "@/lib/plain";

/** One column on every time axis in the app. */
export interface Bucket {
  label: string;
  from: number;
  to: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** A window request as it arrives from the URL. */
export interface RangeRequest {
  /** A preset slug: `7`, `30`, `90`, `all`, or `custom`. */
  range?: string;
  /** `YYYY-MM-DD`, only meaningful when `range` is `custom`. */
  from?: string;
  /** `YYYY-MM-DD`, inclusive. */
  to?: string;
}

export interface ResolvedRange {
  start: Date;
  /** Inclusive. */
  end: Date;
  /** What the picker shows. */
  label: string;
  /** True when the person picked explicit dates rather than a preset. */
  custom: boolean;
}

/** Parse `YYYY-MM-DD` as a local date, or null if it isn't one. */
export function parseDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a date as `YYYY-MM-DD`, in local time. */
export function dayValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Turn a URL range into concrete dates and a label.
 *
 * An unparseable or backwards pair falls back to the default preset rather than
 * rendering an empty screen — a broken URL should not look like "you have no
 * opportunities".
 */
export function resolveRange(request: RangeRequest, earliest: Date, now = new Date()): ResolvedRange {
  if (request.range === "custom") {
    const from = parseDay(request.from);
    const to = parseDay(request.to);
    if (from && to) {
      const start = from <= to ? from : to;
      const last = from <= to ? to : from;
      return {
        start,
        end: new Date(last.getTime() + DAY - 1),
        label: `${shortDay(start)} – ${shortDay(last)}`,
        custom: true,
      };
    }
  }

  const preset = RANGE_OPTIONS.some((option) => option.value === request.range) ? request.range : "7";
  return {
    start: rangeStart(preset, now) ?? earliest,
    end: now,
    label: rangeLabel(preset),
    custom: false,
  };
}

/** A date a person reads: "Sep 7". The one formatter for every date in the UI. */
export function shortDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * A date a person reads with the year: "Sep 7, 2026".
 *
 * The detail screen shows when something was found and when a score was
 * computed, and those can be a year old. `shortDay` is right in a dense table
 * where the year is obvious from context and noise in every row; it is wrong in
 * a sentence claiming when a snapshot was taken.
 */
export function longDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Split a window into equal buckets so every chart x-axis lines up.
 *
 * A 7-day window reads per-day and anything longer reads per-date, because
 * labelling twelve columns with weekday names is meaningless. The caller
 * guarantees `requested` never exceeds the number of days in the span, so no two
 * buckets can land in the same day and no two labels can collide.
 */
export function buildBuckets(start: Date, end: Date, requested: number): Bucket[] {
  const span = Math.max(1, end.getTime() - start.getTime());
  const size = span / requested;
  return Array.from({ length: requested }, (_, index) => {
    const from = start.getTime() + index * size;
    const to = from + size;
    const date = new Date(from + size / 2);
    const label =
      requested <= 7
        ? date.toLocaleDateString("en-US", { weekday: "short" })
        : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { label, from, to };
  });
}

/** Widest and narrowest chart columns a range may produce. */
const MAX_BUCKETS = 12;
const MIN_BUCKETS = 1;

/**
 * How many chart columns a range wants.
 *
 * One column per day, capped at twelve. A fixed count is wrong in both
 * directions: a three-day range split twelve ways puts four columns on the same
 * day, which collides as a React key and — worse — draws a chart claiming a
 * resolution the data does not have. A quarter wants twelve columns; a long
 * weekend wants three.
 */
export function bucketCount(range: ResolvedRange): number {
  const days = Math.round((range.end.getTime() - range.start.getTime()) / DAY);
  return Math.min(MAX_BUCKETS, Math.max(MIN_BUCKETS, days));
}

export interface PeriodWindow<T> {
  start: Date;
  end: Date;
  /** Length of the period, in milliseconds; also the previous period's length. */
  span: number;
  /** Everything inside the current period, per `at`. */
  current: T[];
  /** The equally long period immediately before it, so deltas have a base. */
  previous: T[];
  buckets: Bucket[];
  /** Items in `current` whose `at` falls inside this bucket. */
  inBucket: (bucket: Bucket) => T[];
}

/**
 * Window a list into "this period" and "the period before it", with columns.
 *
 * Everything windows on when the post was **written** (`publishedAt`), not when
 * it was collected (`capturedAt`), and that distinction is load-bearing. A crawl
 * collects a whole batch at one instant, so `capturedAt` is a single value
 * across a seed and carries no distribution at all. Windowing on it made the
 * Overview's headline figures count every row while the chart directly beneath
 * them plotted only recent ones — two different numbers on one screen, with the
 * delta pills reading "n/a" because the previous period could never match.
 *
 * Pass the accessor explicitly so each caller states which timestamp it means.
 */
export function periodWindow<T>(
  items: T[],
  at: (item: T) => string,
  range: ResolvedRange,
): PeriodWindow<T> {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const span = Math.max(DAY, endMs - startMs);
  const atMs = (item: T) => new Date(at(item)).getTime();

  const current = items.filter((item) => atMs(item) >= startMs && atMs(item) <= endMs);
  const previous = items.filter((item) => atMs(item) >= startMs - span && atMs(item) < startMs);

  const buckets = buildBuckets(range.start, range.end, bucketCount(range));

  return {
    start: range.start,
    end: range.end,
    span,
    current,
    previous,
    buckets,
    inBucket: (bucket) => current.filter((item) => atMs(item) >= bucket.from && atMs(item) < bucket.to),
  };
}
