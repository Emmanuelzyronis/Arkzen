import { describe, expect, it } from "vitest";

import { blockedReasonLabels } from "@/lib/plain";
import { defaultServiceProfile } from "@/lib/domain/service-profile";

describe("blockedReasonLabels", () => {
  it("reads a matcher's term as a sentence", () => {
    expect(blockedReasonLabels(["unpaid"])).toEqual(["Unpaid work"]);
    expect(blockedReasonLabels(["no budget right now"])).toEqual(["No budget yet"]);
  });

  it("collapses two spellings of one rule into one label", () => {
    // The profile really does carry both forms so the matcher catches
    // "equity-only" as well as "equity only". A raw list shows the same rule
    // twice, which reads as a bug.
    expect(blockedReasonLabels(["equity only", "equity-only"])).toEqual(["Paid only in equity"]);
  });

  it("keeps rules that genuinely differ", () => {
    expect(blockedReasonLabels(["unpaid", "for exposure"])).toEqual([
      "Unpaid work",
      "Paid in exposure rather than money",
    ]);
  });

  it("preserves order and drops nothing", () => {
    const terms = ["revenue share", "unpaid", "commission only"];
    expect(blockedReasonLabels(terms)).toHaveLength(3);
    expect(blockedReasonLabels(terms)[0]).toBe("Paid only as a share of revenue");
  });

  it("title-cases a rule nobody has written a sentence for yet", () => {
    // Not dropped: these rules decide which leads a person never sees.
    expect(blockedReasonLabels(["swap-for-credit"])).toEqual(["Swap For Credit"]);
  });

  it("returns nothing for nothing", () => {
    expect(blockedReasonLabels([])).toEqual([]);
  });

  it("covers every rule the shipped profile actually enforces", () => {
    // If a rule is added to the profile without a sentence, this fails — the
    // fallback keeps it on screen, but it should be a deliberate choice.
    const labels = blockedReasonLabels(defaultServiceProfile.negativeSignals);
    for (const label of labels) {
      expect(label, `${label} is still showing a matcher's raw wording`).toMatch(
        /^[A-Z][a-z]+( [a-z]| [A-Z])/,
      );
    }
    // Seven terms, six rules — the two equity spellings are one rule.
    expect(defaultServiceProfile.negativeSignals).toHaveLength(7);
    expect(labels).toHaveLength(6);
  });
});
