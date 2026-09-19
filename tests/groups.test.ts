import { describe, expect, it } from "vitest";

import {
  categoryGroups,
  groupOptions,
  groupStats,
  resolveGroup,
  sourceGroups,
} from "@/lib/groups";
import type { OpportunityListItem } from "@/lib/data/repository";

/**
 * The grouping behind `/sources` and `/categories`.
 *
 * The bug these mostly guard against is a shared accessor: an earlier version
 * built every group's `match` closure from one module-level variable, so all of
 * them answered for whichever grouping happened to be built last. Sources would
 * have filtered by category and the panels would have silently shown the wrong
 * rows — no error, just numbers that do not belong to the pill you clicked.
 */

/** The smallest thing that is a valid `OpportunityListItem` for these tests. */
function item(overrides: Partial<OpportunityListItem>): OpportunityListItem {
  return {
    id: "opp",
    title: "A post",
    needSummary: "",
    intentSummary: "",
    score: 70,
    band: "Strong",
    status: "NEW",
    outcome: null,
    category: "ai-integration",
    sourceName: "r/startups",
    sourceUrl: "",
    authorHandle: "someone",
    dataKind: "seeded",
    publishedAt: "2026-09-10T00:00:00.000Z",
    capturedAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    reasons: [],
    risks: [],
    nextAction: null as unknown as OpportunityListItem["nextAction"],
    qualification: null as unknown as OpportunityListItem["qualification"],
    fitValue: 70,
    intentValue: 70,
    urgencyValue: 70,
    reachabilityValue: 70,
    ...overrides,
  };
}

const rows = [
  item({ id: "a", sourceName: "r/startups", category: "ai-integration" }),
  item({ id: "b", sourceName: "r/startups", category: "automation" }),
  item({ id: "c", sourceName: "r/devops", category: "ai-integration" }),
];

describe("grouping", () => {
  it("ranks groups by size, largest first", () => {
    expect(sourceGroups(rows).map((group) => group.key)).toEqual(["r/startups", "r/devops"]);
    expect(sourceGroups(rows).map((group) => group.total)).toEqual([2, 1]);
  });

  it("labels categories in words, not slugs", () => {
    const groups = categoryGroups(rows);
    expect(groups.map((group) => group.label)).toEqual(["AI integration", "Automation"]);
    expect(groups.map((group) => group.key)).toEqual(["ai-integration", "automation"]);
  });

  it("gives every group a match that answers for its own key", () => {
    // The regression. Two groupings built in sequence must not share a matcher.
    const bySource = sourceGroups(rows);
    const byCategory = categoryGroups(rows);

    expect(rows.filter(bySource[0].match).map((row) => row.id)).toEqual(["a", "b"]);
    expect(rows.filter(byCategory[0].match).map((row) => row.id)).toEqual(["a", "c"]);
    // ...and building the second must not have changed the first.
    expect(rows.filter(bySource[0].match).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("drops the closures a client component cannot receive", () => {
    const options = groupOptions(sourceGroups(rows));
    expect(options).toEqual([
      { key: "r/startups", label: "r/startups", total: 2 },
      { key: "r/devops", label: "r/devops", total: 1 },
    ]);
    expect(options.some((option) => "match" in option)).toBe(false);
  });

  it("falls back to the largest group rather than to nothing", () => {
    const groups = sourceGroups(rows);
    expect(resolveGroup(groups, undefined)?.key).toBe("r/startups");
    expect(resolveGroup(groups, "r/devops")?.key).toBe("r/devops");
    // A stale link must still render a real panel on a real set of rows.
    expect(resolveGroup(groups, "r/gone")?.key).toBe("r/startups");
    expect(resolveGroup([], "anything")).toBeNull();
  });
});

describe("groupStats", () => {
  it("reports counts, and no delta when there is nothing to compare against", () => {
    const stats = groupStats(rows, []);
    expect(stats[0]).toMatchObject({ label: "Opportunities found", value: "3", delta: null });
    expect(stats[6]).toMatchObject({ label: "Reply rate", value: "0%" });
  });

  it("compares a rate against the previous rate, not against its numerator", () => {
    // Two replies out of two is 100%; one out of four before is 25%. The rate
    // moved by a quarter of itself (+300%), which is the honest figure. Reading
    // the numerator instead would compare 2 against 1 and report "+100%".
    const current = [item({ outcome: "REPLIED" }), item({ outcome: "REPLIED" })];
    const previous = [
      item({ outcome: "REPLIED" }),
      item({ outcome: null }),
      item({ outcome: null }),
      item({ outcome: null }),
    ];
    const replyRate = groupStats(current, previous).find((stat) => stat.label === "Reply rate")!;
    expect(replyRate.value).toBe("100%");
    expect(replyRate.delta).toBe(300);
  });

  it("counts a win from the outcome column, not the status", () => {
    // `payload` is frozen at capture time, so a won deal records it on
    // `outcome`; a status of WON without the outcome is not a closed win.
    const stats = groupStats([item({ status: "WON", outcome: null })], []);
    expect(stats.find((stat) => stat.label === "Won")!.value).toBe("0");
    expect(groupStats([item({ outcome: "WON" })], []).find((stat) => stat.label === "Won")!.value).toBe("1");
  });

  it("calls the top band 'best matches' and says where the line is", () => {
    const stats = groupStats([item({ band: "High" }), item({ band: "Strong" })], []);
    const best = stats.find((stat) => stat.label === "Best matches")!;
    expect(best.value).toBe("1");
    expect(best.note).toContain("82");
  });

  it("never divides by zero on an empty group", () => {
    const stats = groupStats([], []);
    expect(stats).toHaveLength(8);
    for (const stat of stats) {
      expect(stat.value).not.toMatch(/NaN|Infinity/);
      for (const word of stat.label) expect(word).toBeTruthy();
    }
  });
});
