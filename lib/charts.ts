import type { Bucket } from "@/lib/window";

/**
 * Axis and series maths shared by every chart screen.
 *
 * This is plain arithmetic with no DOM in it, kept out of the components so it
 * can be reasoned about (and tested) on its own.
 */

/**
 * Evenly spaced axis values from 0 to `max`, inclusive.
 *
 * A small range cannot fill every step without repeating a value, and a
 * repeated tick is both a broken-looking axis and a duplicate React key. So the
 * step count is capped by the range itself: a maximum of 2 gets ticks 0/1/2,
 * not 0/1/1/2/2.
 */
export function yTicks(max: number, steps = 4): number[] {
  const count = Math.min(steps, Math.max(1, Math.round(max)));
  return Array.from({ length: count + 1 }, (_, index) => Math.round((max / count) * index));
}

/** A value's share of a total, as a whole percentage. Zero totals read 0, not NaN. */
export function share(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

/** Which column holds the largest value, or -1 when every column is empty. */
export function busiestIndex(values: number[]): number {
  const peak = Math.max(0, ...values);
  return peak === 0 ? -1 : values.indexOf(peak);
}

/**
 * Turn per-column counts into cumulative rates.
 *
 * A short window has too few writes per column for a daily rate to mean
 * anything — one day reads 0% and the next reads 100% purely from sample size.
 * Running totals from the start of the window are stable and still show the
 * trend, which is what the reader is actually after.
 */
export function runningRate(numerator: number[], denominator: number[]): number[] {
  let top = 0;
  let bottom = 0;
  return denominator.map((value, index) => {
    bottom += value;
    top += numerator[index] ?? 0;
    return share(top, bottom);
  });
}

/**
 * A unit that agrees with the number it is attached to.
 *
 * A pair of strings rather than a function, because a chart is a client
 * component and React serialises the props crossing into it: a function in them
 * throws at runtime, with no type error to catch it first. `{ one: "lead",
 * many: "leads" }` renders "1 lead" and "4 leads"; a plain string puts the same
 * suffix on every column, which reads "1 leads".
 */
export type Unit = string | { one: string; many: string };

/** The suffix for one column's value. */
export function unitFor(unit: Unit, value: number): string {
  if (typeof unit === "string") return unit;
  return value === 1 ? unit.one : unit.many;
}

/** Count items per bucket. */
export function countPerBucket<T>(items: T[], buckets: Bucket[], at: (item: T) => string): number[] {
  return buckets.map(
    (bucket) =>
      items.filter((item) => {
        const ms = new Date(at(item)).getTime();
        return ms >= bucket.from && ms < bucket.to;
      }).length,
  );
}
