import type { OpportunityListItem } from "@/lib/data/repository";
import { isReplied, isWorthPursuing } from "@/lib/views";

/**
 * The figures more than one screen reports, computed in one place.
 *
 * `/sources`, `/categories` and `/insights` all show a reply rate and a win
 * rate, and the two screens arrived at them independently at first. The
 * division is one line, but the *rule* is not: a rate compares against the
 * previous period's rate, not against its own numerator, or "three replied
 * where one did" is reported as a 200% improvement. A second copy of that is
 * how the copies start disagreeing — the same reason `lib/views.ts` exists for
 * the predicates rather than each screen naming its own statuses.
 *
 * Everything here takes the two periods as plain arrays, so a screen can pass
 * the whole window or a single group's slice of it and get the same arithmetic.
 */

/**
 * One figure as a card shows it — a `KpiCard`'s props, minus layout.
 *
 * Both grids on both screens are rows of these, so the shape lives beside the
 * arithmetic that fills it rather than in whichever screen was built first.
 */
export interface Tile {
  label: string;
  value: string;
  delta: number | null;
  note: string;
}

/** A share, as a percentage. A zero total reads 0, never NaN. */
export const rate = (part: number, whole: number) => (whole === 0 ? 0 : (part / whole) * 100);

/** The mean of a field across items. Nothing to average reads 0, not NaN. */
export const average = (items: OpportunityListItem[], of: (item: OpportunityListItem) => number) =>
  items.length === 0 ? 0 : items.reduce((sum, item) => sum + of(item), 0) / items.length;

/** Somebody wrote back. */
export const repliedCount = (items: OpportunityListItem[]) => items.filter(isReplied).length;

/** Cleared the fit check against what you sell. */
export const worthCount = (items: OpportunityListItem[]) => items.filter(isWorthPursuing).length;

/**
 * Closed out as a win.
 *
 * Reads `outcome`, not `status`: `payload` is frozen at capture time, so a deal
 * closed after capture records it on `outcome` and a `WON` status alone is not
 * a closed win.
 */
export const wonCount = (items: OpportunityListItem[]) =>
  items.filter((item) => item.outcome === "WON").length;

/**
 * In the top score band.
 *
 * Named "best" wherever it is shown, never "strong": `bandLabel` already calls
 * this band "Strong match" and the band below it "Good match", so a tile
 * labelled "Strong matches" could be read as either one.
 */
export const bestCount = (items: OpportunityListItem[]) =>
  items.filter((item) => item.band === "High").length;

/** Contacted, and nobody has written back yet. */
export const awaitingReplyCount = (items: OpportunityListItem[]) =>
  items.filter((item) => item.status === "ACTIVE" && !isReplied(item)).length;
