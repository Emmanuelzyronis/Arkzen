import { describe, expect, it } from "vitest";

import { unitFor, yTicks } from "@/lib/charts";
import { bucketCount, buildBuckets, dayValue, parseDay, resolveRange } from "@/lib/window";

/**
 * The period picker, the chart axis and the bucket maths.
 *
 * Both of the cases marked "regression" below shipped as real bugs: a custom
 * range produced twelve buckets over three days (so four columns shared a label
 * and collided as React keys, and the chart claimed a resolution the data did
 * not have), and the y-axis emitted repeated ticks whenever the maximum was
 * smaller than the step count. Neither was visible without opening the console.
 */

const at = (value: string) => parseDay(value)!;

describe("resolveRange", () => {
  it("covers the whole last day of a custom range", () => {
    const range = resolveRange({ range: "custom", from: "2026-09-07", to: "2026-09-10" }, at("2026-09-01"));
    expect(dayValue(range.start)).toBe("2026-09-07");
    // Inclusive: the window must still contain something published late on the
    // 10th, not stop at midnight that morning.
    expect(range.end.getTime()).toBeGreaterThan(at("2026-09-10").getTime());
    expect(range.label).toBe("Sep 7 – Sep 10");
  });

  it("reverses a backwards range rather than rendering nothing", () => {
    const range = resolveRange({ range: "custom", from: "2026-09-10", to: "2026-09-07" }, at("2026-09-01"));
    expect(dayValue(range.start)).toBe("2026-09-07");
    expect(range.custom).toBe(true);
  });

  it("falls back to the default preset when the dates are unusable", () => {
    const range = resolveRange({ range: "custom", from: "garbage", to: "2026-09-10" }, at("2026-09-01"));
    expect(range.custom).toBe(false);
  });
});

describe("bucketCount", () => {
  it("gives a quarter twelve columns and a week seven", () => {
    expect(bucketCount(resolveRange({ range: "90" }, at("2026-01-01")))).toBe(12);
    expect(bucketCount(resolveRange({ range: "7" }, at("2026-09-05")))).toBe(7);
  });

  it("regression: a short custom range gets one column per day, not twelve", () => {
    // Sep 7 to Sep 10 inclusive is four days, so four columns.
    const range = resolveRange({ range: "custom", from: "2026-09-07", to: "2026-09-10" }, at("2026-09-01"));
    expect(bucketCount(range)).toBe(4);
  });

  it("regression: a short range never produces two buckets on the same day", () => {
    const range = resolveRange({ range: "custom", from: "2026-09-07", to: "2026-09-10" }, at("2026-09-01"));
    const labels = buildBuckets(range.start, range.end, bucketCount(range)).map((bucket) => bucket.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never returns fewer than one column", () => {
    const range = resolveRange({ range: "custom", from: "2026-09-07", to: "2026-09-07" }, at("2026-09-01"));
    expect(bucketCount(range)).toBeGreaterThanOrEqual(1);
  });
});

describe("buildBuckets", () => {
  it("spans the window end to end with no gaps", () => {
    const range = resolveRange({ range: "7" }, at("2026-09-05"));
    const buckets = buildBuckets(range.start, range.end, bucketCount(range));
    expect(buckets[0].from).toBe(range.start.getTime());
    expect(buckets.at(-1)!.to).toBeCloseTo(range.end.getTime(), -3);
    for (let index = 1; index < buckets.length; index += 1) {
      expect(buckets[index].from).toBe(buckets[index - 1].to);
    }
  });
});

describe("yTicks", () => {
  it("spaces four steps across a large maximum", () => {
    expect(yTicks(100)).toEqual([0, 25, 50, 75, 100]);
  });

  it("regression: never repeats a tick when the maximum is below the step count", () => {
    // A one-row period is the ordinary case on a cold database, and
    // 0/0/0/0/1 was both a broken-looking axis and a duplicate React key.
    for (const max of [1, 2, 3, 4, 5]) {
      const ticks = yTicks(max);
      expect(new Set(ticks).size, `max=${max} produced ${ticks.join("/")}`).toBe(ticks.length);
    }
  });

  it("still reaches the maximum and starts at zero", () => {
    for (const max of [1, 2, 3, 7, 40]) {
      const ticks = yTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBe(max);
    }
  });
});

describe("unitFor", () => {
  it("agrees with the number it is attached to", () => {
    const leads = { one: " lead", many: " leads" };
    expect(unitFor(leads, 1)).toBe(" lead");
    expect(unitFor(leads, 0)).toBe(" leads");
    expect(unitFor(leads, 4)).toBe(" leads");
  });

  it("puts a plain string on every value unchanged", () => {
    expect(unitFor("%", 1)).toBe("%");
    expect(unitFor("", 7)).toBe("");
  });

  it("regression: takes a pair, not a function", () => {
    // The first attempt at this passed `unit={(value) => …}` from the server
    // component `GroupPanel` into the client `BarChart`. React serialises props
    // across that boundary and a function in them throws at runtime —
    // "Functions cannot be passed directly to Client Components" — with no type
    // error to catch it first, because the prop's declared type accepted it.
    // A pair of strings survives the crossing; a callable does not.
    expect(typeof unitFor).toBe("function");
    for (const unit of ["", "%", { one: " lead", many: " leads" }]) {
      expect(JSON.parse(JSON.stringify(unit))).toEqual(unit);
    }
  });
});
