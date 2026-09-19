import { describe, expect, it } from "vitest";

import { humanizeAge } from "@/lib/domain/text";

/**
 * How long ago, in words.
 *
 * The timeline on a lead's page prints this string directly beneath the action a
 * person just took, so an overstatement is visible immediately. Two of these
 * cases are regressions: the old implementation started at `Math.max(1, …)`
 * hours, which made a note saved ten seconds ago read "1h ago", and it rounded,
 * which made 3.9 days read "4d ago".
 */

const at = (iso: string) => new Date(iso);
const NOW = at("2026-09-12T12:00:00.000Z");

function ago(ms: number): string {
  return humanizeAge(new Date(NOW.getTime() - ms).toISOString(), NOW);
}

describe("humanizeAge", () => {
  it("says 'just now' for something that has only just happened", () => {
    // Regression: this read "1h ago".
    expect(ago(0)).toBe("just now");
    expect(ago(10_000)).toBe("just now");
    expect(ago(59_000)).toBe("just now");
  });

  it("counts minutes below the hour", () => {
    expect(ago(60_000)).toBe("1m ago");
    expect(ago(59 * 60_000)).toBe("59m ago");
  });

  it("counts hours below the day", () => {
    expect(ago(60 * 60_000)).toBe("1h ago");
    expect(ago(23 * 3_600_000)).toBe("23h ago");
  });

  it("counts days below two weeks", () => {
    expect(ago(24 * 3_600_000)).toBe("1d ago");
    expect(ago(13 * 24 * 3_600_000)).toBe("13d ago");
  });

  it("counts weeks after that", () => {
    expect(ago(14 * 24 * 3_600_000)).toBe("2w ago");
  });

  it("rounds down, never up", () => {
    // Regression: 3.9 days used to read "4d ago", claiming more time had passed
    // than actually had.
    expect(ago(3.9 * 24 * 3_600_000)).toBe("3d ago");
    expect(ago(23.9 * 3_600_000)).toBe("23h ago");
  });

  it("does not go negative for a timestamp slightly in the future", () => {
    // Clock skew between the database and the renderer is real and must not
    // print "-1m ago".
    expect(ago(-30_000)).toBe("just now");
  });
});
