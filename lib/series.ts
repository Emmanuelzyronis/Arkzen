/**
 * The chart series palette, in one place.
 *
 * This lived in `app/page.tsx` and had to move: `/sources` and `/categories`
 * show the same sources the Overview does, and if each screen carried its own
 * copy the legend would change colour as you navigated between them. A colour
 * that means "Reddit" on one screen has to mean "Reddit" on the next.
 *
 * Green leads because `--brand` is the app's only saturated colour; the rest are
 * deliberately cooler and quieter so the first series stays dominant.
 */
export const SERIES_COLORS = [
  "var(--brand)",
  "#38bdf8",
  "#f59e0b",
  "#a78bfa",
  "#f472b6",
] as const;

/** The colour for a series at `index`, wrapping when there are more series than colours. */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export interface SeriesRow {
  name: string;
  value: number;
  /** The same figure over the preceding period, so a delta can be shown. */
  before: number;
  color: string;
}

/**
 * Tally items into ranked series rows, largest first.
 *
 * Ties break alphabetically rather than by insertion order so the list doesn't
 * reshuffle between two runs that found the same thing.
 */
export function tallySeries<T>(
  current: T[],
  previous: T[],
  key: (item: T) => string,
): SeriesRow[] {
  const tally = new Map<string, number>();
  for (const item of current) tally.set(key(item), (tally.get(key(item)) ?? 0) + 1);

  const before = new Map<string, number>();
  for (const item of previous) before.set(key(item), (before.get(key(item)) ?? 0) + 1);

  return [...tally.entries()]
    .map(([name, value]) => ({ name, value, before: before.get(name) ?? 0 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, color: seriesColor(index) }));
}
