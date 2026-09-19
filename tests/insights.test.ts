import { describe, expect, it } from "vitest";

import type { OpportunityListItem } from "@/lib/data/repository";
import { BANDS, bandCounts, funnel, insightStats, summariseRun } from "@/lib/insights";
import { runProblemLabel } from "@/lib/plain";
import { FUNNEL_STAGES } from "@/lib/views";

/**
 * The figures behind `/insights`.
 *
 * Three things here are the kind of wrong that survives a screenshot: a band
 * distribution that drops its empty buckets (so the axis silently changes shape
 * between periods), a rate whose delta compares against its own numerator, and a
 * search run narrated with a reason the pipeline never recorded. Each has a test
 * below, and the reasons are in the comments.
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

describe("bandCounts", () => {
  it("counts each band under its plain name", () => {
    const counts = bandCounts([
      item({ band: "High" }),
      item({ band: "High" }),
      item({ band: "Watch" }),
    ]);
    const byLabel = Object.fromEntries(counts.map((entry) => [entry.label, entry.value]));
    expect(byLabel["Strong match"]).toBe(2);
    expect(byLabel["Worth a look"]).toBe(1);
    expect(byLabel["Good match"]).toBe(0);
  });

  it("regression: keeps a column for every band, even the empty ones", () => {
    // Filtering the zeroes out would leave a period with no weak matches showing
    // three columns where the period before showed four. The reader would see
    // the axis change and read it as improvement.
    const counts = bandCounts([item({ band: "High" })]);
    expect(counts.map((entry) => entry.value)).toEqual([1, 0, 0, 0]);
    expect(counts).toHaveLength(BANDS.length);
  });

  it("orders best first", () => {
    expect(bandCounts([]).map((entry) => entry.label)).toEqual([
      "Strong match",
      "Good match",
      "Worth a look",
      "Weak match",
    ]);
  });

  it("reports nothing for an empty period rather than crashing", () => {
    expect(bandCounts([]).every((entry) => entry.value === 0)).toBe(true);
  });
});

describe("insightStats", () => {
  const current = [
    item({ id: "a", score: 90, band: "High", status: "WON", outcome: "WON" }),
    item({ id: "b", score: 50, band: "Watch", status: "ACTIVE", outcome: "REPLIED" }),
    item({ id: "c", score: 40, band: "Low", status: "NEW" }),
    item({ id: "d", score: 60, band: "Strong", status: "QUALIFIED" }),
  ];
  const previous = [item({ id: "e", score: 70, band: "Strong", status: "NEW", outcome: "REPLIED" })];

  const tile = (tiles: ReturnType<typeof insightStats>, label: string) => {
    const found = tiles.find((entry) => entry.label === label);
    if (!found) throw new Error(`no tile labelled ${label}`);
    return found;
  };

  it("gives the reference's five tiles, and no more", () => {
    // The reference's top row is five cards. A sixth would break its composition
    // and, here, duplicate a column of the chart directly below.
    expect(insightStats(current, previous)).toHaveLength(5);
  });

  it("counts the period it was handed", () => {
    const tiles = insightStats(current, previous);
    expect(tile(tiles, "Opportunities found").value).toBe("4");
    // Won, in progress and qualified are all worth pursuing; the new one is not.
    expect(tile(tiles, "Worth pursuing").value).toBe("3");
  });

  it("rounds the average score to a whole number", () => {
    // (90 + 50 + 40 + 60) / 4 = 60
    expect(tile(insightStats(current, previous), "Average match score").value).toBe("60");
  });

  it("regression: a rate's delta compares rate to rate, not numerator to numerator", () => {
    // Half replied now (2 of 4); everyone replied before (1 of 1). A delta taken
    // on the numerators would read "up 1" — an improvement — while the rate
    // actually fell from 100% to 50%. This is the shape of bug the group screens
    // already had once, and the rule now lives in `lib/metrics.ts` shared by both.
    const tiles = insightStats(current, previous);
    const reply = tile(tiles, "Reply rate");
    expect(reply.value).toBe("50%");
    expect(reply.delta).toBe(-50);
  });

  it("reports no delta rather than a fabricated one when there is no previous period", () => {
    // Every tile right now reads "n/a" on a freshly seeded corpus, and that is
    // correct: there is nothing to compare against. It is recorded in
    // `docs/REDESIGN.md` as accepted, not as a bug to paper over.
    const tiles = insightStats(current, []);
    expect(tiles.every((entry) => entry.delta === null)).toBe(true);
  });

  it("says nothing rather than NaN when the period is empty", () => {
    const tiles = insightStats([], []);
    expect(tiles.map((entry) => entry.value)).toEqual(["0", "0", "0", "0%", "0%"]);
    for (const entry of tiles) expect(entry.value).not.toContain("NaN");
  });
});

describe("funnel", () => {
  it("is non-increasing and states the conversion rate", () => {
    const { stages, conversion } = funnel([
      item({ id: "a", status: "WON", outcome: "WON" }),
      item({ id: "b", status: "QUALIFIED" }),
      item({ id: "c", status: "NEW" }),
      item({ id: "d", status: "NEW" }),
    ]);
    const values = stages.map((stage) => stage.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(values[0]).toBe(4);
    expect(conversion).toBe(25);
  });

  it("regression: no stage is named after a status it cannot equal", () => {
    // Stage 1 was called "Worth pursuing", which is also the name of a status
    // and of the tile directly above the chart. The two numbers differ by
    // construction — the stage counts everything that ever got that far,
    // including deals since lost, while the tile counts what is open now — so
    // the screen showed "Worth pursuing 3" beside "Worth pursuing 2" with
    // nothing to explain the gap. The stage now names the milestone instead.
    //
    // "Won" is deliberately allowed to stay: a won deal is won under either
    // reading, so the two agree rather than collide. These two do not — a deal
    // that has gone cold is not still "in progress", and one that was lost
    // after being qualified is not still "worth pursuing", yet the funnel
    // counts both.
    for (const stage of FUNNEL_STAGES) {
      expect(["Worth pursuing", "In progress"], `stage "${stage}" is a status name`).not.toContain(
        stage,
      );
    }
  });

  it("regression: an empty period reads 0%, not NaN%", () => {
    // Dividing the last stage by a zero first stage is the ordinary first state
    // of this screen on a cold database, and "NaN%" in a card header gets read
    // as a real figure long before anyone questions it.
    const { conversion } = funnel([]);
    expect(conversion).toBe(0);
    expect(`${conversion}`).not.toBe("NaN");
  });
});

describe("summariseRun", () => {
  const run = (overrides: Partial<Parameters<typeof summariseRun>[0]> = {}) =>
    summariseRun({
      id: "run-1",
      completedAt: "2026-09-12T09:00:00.000Z",
      observed: 15,
      kept: 11,
      rejected: 4,
      duplicates: 0,
      created: 0,
      sourceRuns: [{ sourceName: "Reddit", status: "SUCCESS" }],
      ...overrides,
    });

  it("leads with what the run came to", () => {
    expect(run({ created: 3 }).headline).toBe("3 new leads");
    // Grammar, not decoration: "1 new leads" is the tell that nobody read it.
    expect(run({ created: 1 }).headline).toBe("1 new lead");
  });

  it("distinguishes an empty search from a search that found only familiar posts", () => {
    expect(run({ observed: 0, kept: 0, rejected: 0, duplicates: 0, created: 0 }).headline).toBe(
      "Nothing came back",
    );
    expect(run({ duplicates: 11, created: 0 }).headline).toBe(
      "Nothing new — you already had all 11 of these",
    );
  });

  it("states the composition without claiming a reason for the rejections", () => {
    // `rejected` is the sum of three unrelated filters — a blocked pattern,
    // someone selling rather than buying, and a post too short to judge — and
    // the run row stores only the total. Naming one of them would tell the
    // operator their search missed something it did not.
    const summary = run();
    expect(summary.breakdown).toBe("15 read · 11 kept · 4 filtered out");
  });

  it("omits a count that is zero rather than padding the line with zeroes", () => {
    expect(run({ duplicates: 0 }).breakdown).not.toContain("already had");
    expect(run({ rejected: 0 }).breakdown).not.toContain("filtered out");
  });

  it("names a blocked source with a plain reason, never the raw status", () => {
    const summary = run({
      sourceRuns: [
        { sourceName: "Reddit", status: "ACCESS_RESTRICTED" },
        { sourceName: "Reviewed captures", status: "SUCCESS" },
      ],
    });
    expect(summary.blocked).toEqual(["Reddit wouldn't let us search"]);
    expect(summary.blocked.join(" ")).not.toContain("ACCESS_RESTRICTED");
  });

  it("treats a partial success as an answered source, not a blocked one", () => {
    expect(run({ sourceRuns: [{ sourceName: "Reddit", status: "PARTIAL_SUCCESS" }] }).blocked).toEqual(
      [],
    );
  });

  it("treats a status it has never seen as a problem rather than as success", () => {
    // The failure that matters is a blocked source going unmentioned. An unknown
    // status mentioned once too often is the cheaper mistake.
    const summary = run({ sourceRuns: [{ sourceName: "Reddit", status: "SOMETHING_NEW" }] });
    expect(summary.blocked).toHaveLength(1);
    expect(summary.blocked[0]).toBe("Reddit didn't answer");
  });

  it("uses the run's own source name, not the provider-id mapping", () => {
    // `sourceLabel` maps a provider *id* to a name. These are already names, and
    // running a correct one through it would re-case it ("Reviewed captures"
    // would come back as "Reviewed Captures").
    const summary = run({ sourceRuns: [{ sourceName: "Reviewed captures", status: "TIMEOUT" }] });
    expect(summary.blocked[0]).toBe("Reviewed captures took too long to answer");
  });
});

describe("runProblemLabel", () => {
  it("returns nothing for a search that worked", () => {
    // Deliberately absent rather than mapped to "went fine": a search that
    // worked is described by what it found, not by a status word.
    expect(runProblemLabel("SUCCESS")).toBeNull();
    expect(runProblemLabel("PARTIAL_SUCCESS")).toBeNull();
  });

  it("covers every status the pipeline can report", () => {
    // The six non-success values from `lib/sources/types.ts`. If one is added
    // and not mapped, the UI falls back to "didn't answer" — honest, but this
    // test is what makes someone notice.
    for (const status of [
      "TIMEOUT",
      "RATE_LIMITED",
      "ACCESS_RESTRICTED",
      "PROVIDER_ERROR",
      "INVALID_RESPONSE",
      "NORMALIZATION_ERROR",
    ]) {
      expect(runProblemLabel(status), status).toBeTruthy();
    }
  });
});
