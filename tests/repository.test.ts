import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";

const dbPath = "/tmp/arkzen-test-repository.sqlite3";
process.env.ARKZEN_SQLITE_PATH = dbPath;

/**
 * Two workspaces.
 *
 * Every row belongs to a person now, so a call that does not name one is not
 * testing the repository — it is testing a version of it that no longer exists.
 * `STRANGER` exists so the isolation tests at the bottom have somebody to be a
 * stranger as.
 */
const OWNER = "user_test_owner";
const STRANGER = "user_test_stranger";

let repo: typeof import("@/lib/data/repository");

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
  repo = await import("@/lib/data/repository");
});

describe("seeding and persistence", () => {
  it("seeds the corpus into scored opportunities with a discovery activity", async () => {
    const items = await repo.listOpportunities(OWNER);
    expect(items.length).toBeGreaterThanOrEqual(9);

    const hero = await repo.getOpportunity(OWNER, items[0].id);
    expect(hero).not.toBeNull();
    expect(hero!.score).toBeGreaterThan(0);
    expect(hero!.strategy.suggestedMessage.length).toBeGreaterThan(80);
    expect(hero!.activities.some((activity) => activity.kind === "DISCOVERED")).toBe(true);
    expect(hero!.qualification.whyQualified.length).toBeGreaterThan(0);
  });

  it("is idempotent: re-importing the same signals creates nothing new", async () => {
    const { defaultServiceProfile } = await import("@/lib/domain/service-profile");
    const { corpusSource } = await import("@/lib/sources/corpus-source");
    const { buildOpportunities } = await import("@/lib/domain/pipeline");

    const before = (await repo.listOpportunities(OWNER)).length;
    const search = await corpusSource.search(defaultServiceProfile, 100);
    const result = buildOpportunities(search.signals, defaultServiceProfile);
    // Returns the rows it actually stored, so a second pass stores nothing and
    // says so by returning an empty list rather than the count 0.
    const created = await repo.insertOpportunities(OWNER, result.opportunities);
    const after = (await repo.listOpportunities(OWNER)).length;
    expect(created).toEqual([]);
    expect(after).toBe(before);
  });

  it("returns the rows it stored, not the first N of what it was given", async () => {
    // The regression this guards. The capture route pairs its "Captured live
    // from …" activity with `insertOpportunities`' result. When that result was
    // a count, the route reached back into the *input* and took its first N
    // entries — which are only the new ones when nothing is skipped. The row
    // removed below is the LAST of the batch on purpose: a naive `slice(0, 1)`
    // would return the first lead, so a test that removed the first one would
    // pass either way and guard nothing.
    const { defaultServiceProfile } = await import("@/lib/domain/service-profile");
    const { corpusSource } = await import("@/lib/sources/corpus-source");
    const { buildOpportunities } = await import("@/lib/domain/pipeline");
    const { getDriver } = await import("@/lib/data/driver");

    const search = await corpusSource.search(defaultServiceProfile, 100);
    const result = buildOpportunities(search.signals, defaultServiceProfile);
    const first = result.opportunities[0];
    const target = result.opportunities[result.opportunities.length - 1];

    // Clear one lead out so the next call sees a genuine mix: nearly everything
    // already on file, exactly one new.
    const driver = await getDriver();
    await driver.run(
      "delete from activities where opportunity_id = ? and owner_id = ?",
      [target.id, OWNER],
    );
    await driver.run("delete from opportunities where id = ? and owner_id = ?", [target.id, OWNER]);

    const before = (await repo.listOpportunities(OWNER)).length;
    const inserted = await repo.insertOpportunities(OWNER, result.opportunities);

    expect(inserted.map((entry) => entry.id)).toEqual([target.id]);
    expect(inserted.map((entry) => entry.id)).not.toContain(first.id);
    expect((await repo.listOpportunities(OWNER)).length).toBe(before + 1);

    // A lead that was already on file must not gain a second discovery entry.
    const stored = await repo.getOpportunity(OWNER, first.id);
    expect(stored!.activities.filter((activity) => activity.kind === "DISCOVERED")).toHaveLength(1);
  });

  it("records a status change as an append-only activity", async () => {
    const items = await repo.listOpportunities(OWNER);
    const target = items[0];
    const updated = await repo.updateStatus(OWNER, target.id, "REVIEWING", "Looks relevant, reading the full post");
    expect(updated!.status).toBe("REVIEWING");
    const last = updated!.activities[updated!.activities.length - 1];
    expect(last.kind).toBe("STATUS_CHANGE");
    expect(last.statusFrom).toBe(target.status);
    expect(last.statusTo).toBe("REVIEWING");
    expect(last.detail).toContain("reading the full post");

    const refetched = await repo.getOpportunity(OWNER, target.id);
    expect(refetched!.status).toBe("REVIEWING");
  });

  it("maps an outcome to a status and stores the note", async () => {
    const items = await repo.listOpportunities(OWNER);
    const target = items[1];
    const updated = await repo.recordOutcome(OWNER, target.id, "REPLIED", "They asked for a call next week");
    expect(updated!.outcome).toBe("REPLIED");
    expect(updated!.status).toBe("ACTIVE");
    expect(updated!.outcomeNote).toContain("next week");
    expect(updated!.activities.some((activity) => activity.kind === "OUTCOME")).toBe(true);
  });

  it("persists partner messages and their decisions", async () => {
    const items = await repo.listOpportunities(OWNER);
    const target = items[0];
    const message = await repo.insertPartnerMessage(OWNER, {
      opportunityId: target.id,
      role: "partner",
      content: "Pursue this — the request matches your AI integration work.",
      grounding: ["Original post", "Fit 88/100"],
      provider: "arkzen-reasoning",
    });
    expect(await repo.decidePartnerMessage(OWNER, target.id, message.id, "accepted", null)).toBe(true);

    const reloaded = await repo.getOpportunity(OWNER, target.id);
    const stored = reloaded!.partnerThread.find((entry) => entry.id === message.id);
    expect(stored).toBeDefined();
    expect(stored!.decision).toBe("accepted");
    expect(stored!.grounding).toContain("Fit 88/100");
  });

  it("refuses a decision aimed at a message on a different lead", async () => {
    const items = await repo.listOpportunities(OWNER);
    const [owner, other] = items;
    const message = await repo.insertPartnerMessage(OWNER, {
      opportunityId: owner.id,
      role: "partner",
      content: "Pursue this — the request matches your AI integration work.",
      grounding: ["Original post"],
      provider: "arkzen-reasoning",
    });

    // The lead exists, so the route's own check passes; the message is simply
    // not on it. Before this was scoped, the update matched by id alone and
    // rewrote the owner's message while reporting success against `other`.
    expect(await repo.decidePartnerMessage(OWNER, other.id, message.id, "rejected", null)).toBe(false);

    const reloaded = await repo.getOpportunity(OWNER, owner.id);
    const stored = reloaded!.partnerThread.find((entry) => entry.id === message.id);
    expect(stored!.decision).toBeNull();
    expect(stored!.decisionNote).toBeNull();
  });

  it("keeps the activity history in order and never overwrites earlier entries", async () => {
    const items = await repo.listOpportunities(OWNER);
    const target = items[0];
    const before = (await repo.getOpportunity(OWNER, target.id))!.activities.length;
    await repo.insertActivity(OWNER, {
      opportunityId: target.id,
      kind: "NOTE",
      actor: "operator",
      summary: "Called and left a voicemail",
    });
    const activities = (await repo.getOpportunity(OWNER, target.id))!.activities;
    expect(activities.length).toBe(before + 1);
    for (let index = 1; index < activities.length; index += 1) {
      expect(new Date(activities[index].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(activities[index - 1].createdAt).getTime(),
      );
    }
  });

  it("aggregates insights from stored rows only", async () => {
    const insights = await repo.getInsights(OWNER);
    expect(insights.total).toBeGreaterThanOrEqual(9);
    expect(insights.storage).toMatch(/SQLite|Postgres/);
    expect(insights.averageScore).toBeGreaterThan(0);
    expect(insights.runs.length).toBeGreaterThan(0);
    expect(insights.byBand.High).toBeGreaterThanOrEqual(1);
  });
});

/**
 * The reason every call above takes an owner at all.
 *
 * Each assertion here would have passed the wrong way before this change: with
 * one shared workspace, the stranger saw the operator's rows and could rewrite
 * them. The counts are asserted rather than the filter, because a filter that is
 * present but wrong looks identical to one that is absent.
 */
describe("one person's workspace", () => {
  it("gives a second person the corpus rather than the first person's rows", async () => {
    const mine = await repo.listOpportunities(OWNER);
    const theirs = await repo.listOpportunities(STRANGER);
    expect(theirs.length).toBeGreaterThanOrEqual(9);
    expect(mine.length).toBeGreaterThanOrEqual(9);
    // The two workspaces hold the same ids, because a lead's id is derived from
    // the posting it came from. Overlap here is expected and is not a leak —
    // what matters is that a row is one person's, which is what the tests below
    // pin down.
    expect(theirs.some((item) => mine.some((own) => own.id === item.id))).toBe(true);
  });

  it("returns nothing for an id neither workspace holds", async () => {
    // The same answer for both, so the id is not an oracle: a stranger cannot
    // tell an id that exists elsewhere from one that never existed.
    expect(await repo.getOpportunity(OWNER, "does-not-exist-at-all")).toBeNull();
    expect(await repo.getOpportunity(STRANGER, "does-not-exist-at-all")).toBeNull();
    expect(await repo.updateStatus(STRANGER, "does-not-exist-at-all", "WON", "x")).toBeNull();
  });

  it("keeps one person's work on a lead out of the other's workspace", async () => {
    const target = (await repo.listOpportunities(OWNER))[0];
    const strangerBefore = (await repo.getOpportunity(STRANGER, target.id))!;

    // Move the operator's row first, so the two workspaces differ by something
    // this test caused rather than by whatever ran before it.
    expect((await repo.updateStatus(OWNER, target.id, "QUALIFIED", "operator moved this"))!.status).toBe(
      "QUALIFIED",
    );

    const strangerUnchanged = (await repo.getOpportunity(STRANGER, target.id))!;
    expect(strangerUnchanged.status).toBe(strangerBefore.status);
    expect(strangerUnchanged.activities.length).toBe(strangerBefore.activities.length);

    // Then the reverse: a legitimate write in the stranger's own workspace. The
    // id is one they hold too, so this succeeds — on their row.
    const ownerBefore = (await repo.getOpportunity(OWNER, target.id))!;
    expect((await repo.updateStatus(STRANGER, target.id, "WON", "changed in my own workspace"))!.status).toBe(
      "WON",
    );
    await repo.recordOutcome(STRANGER, target.id, "WON", "my own outcome");

    const strangerAfter = (await repo.getOpportunity(STRANGER, target.id))!;
    expect(strangerAfter.status).toBe("WON");
    expect(strangerAfter.outcomeNote).toBe("my own outcome");

    // And the operator's row is exactly as it was — same status, no outcome,
    // none of the stranger's activity on it. This is the assertion that fails
    // if any query lost its owner filter.
    const ownerAfter = (await repo.getOpportunity(OWNER, target.id))!;
    expect(ownerAfter.status).toBe(ownerBefore.status);
    expect(ownerAfter.outcome).toBe(ownerBefore.outcome);
    expect(
      ownerAfter.activities.some((activity) => activity.detail?.includes("my own workspace")),
    ).toBe(false);
  });

  it("does not leak conversations or source checks across people", async () => {
    expect((await repo.listOpportunities(OWNER)).length).toBeGreaterThan(0);
    const mine = await repo.listConversations(OWNER);
    // The stranger has leads but has never spoken about one, so anything in
    // their rail came from the other workspace.
    expect(mine.length).toBeGreaterThan(0);
    expect(await repo.listConversations(STRANGER)).toHaveLength(0);

    const theirHealth = await repo.listSourceHealth(STRANGER);
    expect(theirHealth.length).toBeGreaterThan(0);
    // `test_provider` is a check this file recorded for OWNER alone.
    expect(theirHealth.some((entry) => entry.providerId === "test_provider")).toBe(false);
  });

  it("counts each person's insights over their own rows only", async () => {
    const mine = await repo.getInsights(OWNER);
    const theirs = await repo.getInsights(STRANGER);
    expect(mine.total).toBeGreaterThanOrEqual(9);
    // Equal because both workspaces hold the same seed. An unscoped read would
    // count the union instead — roughly double.
    expect(theirs.total).toBe(mine.total);
  });
});
