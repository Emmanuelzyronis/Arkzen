import { describe, expect, it } from "vitest";

import { groupConversations, previewOf, selectedConversation } from "@/lib/assistant";
import type { Conversation } from "@/lib/data/repository";

/**
 * The rail's arithmetic.
 *
 * `lib/assistant.ts` imports `Conversation` as a type only, so nothing here
 * touches the database — the module is pure and these run in milliseconds.
 */

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    opportunityId: "opp-1",
    title: "Rebuild our onboarding flow",
    lastAt: "2026-09-12T09:00:00.000Z",
    messages: 2,
    lastMessage: "Take the signup step first.",
    ...overrides,
  };
}

describe("previewOf", () => {
  it("takes the first line with something in it", () => {
    expect(previewOf("Headline here\n\nThen the reasoning.")).toBe("Headline here");
  });

  it("skips blank leading lines rather than returning nothing", () => {
    expect(previewOf("\n\n   \nThe actual first line")).toBe("The actual first line");
  });

  it("skips the draft rule but keeps the draft", () => {
    // A thread whose last message is only a draft still previews as the draft.
    expect(previewOf("--- DRAFT ---\nHi, I saw your post…")).toBe("Hi, I saw your post…");
    expect(previewOf("----- draft -----\nHi there")).toBe("Hi there");
  });

  it("does not mistake prose mentioning a draft for the rule", () => {
    expect(previewOf("DRAFT — here is what I would say")).toBe("DRAFT — here is what I would say");
  });

  it("cuts a long line and marks the cut", () => {
    const long = "x".repeat(200);
    const preview = previewOf(long);
    expect(preview).toHaveLength(120);
    expect(preview.endsWith("…")).toBe(true);
  });

  it("returns empty for nothing at all, so the caller can omit the line", () => {
    expect(previewOf("")).toBe("");
    expect(previewOf("   \n  \n")).toBe("");
    expect(previewOf("--- DRAFT ---")).toBe("");
  });
});

describe("selectedConversation", () => {
  const recent = conversation({ opportunityId: "opp-2", title: "Second" });
  const older = conversation({ opportunityId: "opp-1", title: "First" });

  it("opens the requested conversation when it exists", () => {
    expect(selectedConversation([recent, older], "opp-1")?.title).toBe("First");
  });

  it("falls back to the most recent when there is no request", () => {
    expect(selectedConversation([recent, older])?.opportunityId).toBe("opp-2");
  });

  it("falls back rather than erroring on an id it does not know", () => {
    // A stale link is an ordinary thing to arrive with; refusing to show the one
    // conversation that does exist would be the worse answer.
    expect(selectedConversation([recent, older], "gone")?.opportunityId).toBe("opp-2");
  });

  it("is null when there are no conversations at all", () => {
    expect(selectedConversation([], "opp-1")).toBeNull();
  });
});

describe("groupConversations", () => {
  const now = new Date("2026-09-12T12:00:00.000Z");
  const hoursAgo = (hours: number, id: string) =>
    conversation({
      opportunityId: id,
      lastAt: new Date(now.getTime() - hours * 3_600_000).toISOString(),
    });

  it("buckets by elapsed time, and labels each bucket with what it measures", () => {
    const groups = groupConversations([hoursAgo(1, "a"), hoursAgo(50, "b"), hoursAgo(400, "c")], now);
    expect(groups.map((group) => group.label)).toEqual(["Last 24 hours", "Last week", "Earlier"]);
    expect(groups.map((group) => group.items.map((item) => item.opportunityId))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("puts the boundaries where the labels say they are", () => {
    const groups = groupConversations(
      [hoursAgo(23.9, "just-inside"), hoursAgo(24.1, "just-outside")],
      now,
    );
    expect(groups[0].items.map((item) => item.opportunityId)).toEqual(["just-inside"]);
    expect(groups[1].items.map((item) => item.opportunityId)).toEqual(["just-outside"]);
  });

  it("drops empty buckets rather than drawing an empty heading", () => {
    const groups = groupConversations([hoursAgo(2, "a")], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Last 24 hours");
  });

  it("keeps a future timestamp visible instead of dropping it", () => {
    // A clock that disagrees with the server is not a fourth bucket, and a
    // conversation that exists must appear somewhere.
    const groups = groupConversations([hoursAgo(-5, "ahead")], now);
    expect(groups[0].items.map((item) => item.opportunityId)).toEqual(["ahead"]);
  });
});
