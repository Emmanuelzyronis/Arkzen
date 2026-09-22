import { beforeAll, describe, expect, it, vi } from "vitest";
import { rmSync } from "node:fs";

const dbPath = "/tmp/arkzen-test-api.sqlite3";
process.env.ARKZEN_SQLITE_PATH = dbPath;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

/**
 * Who the routes think is calling.
 *
 * Every handler asks Clerk for the session, and there is no browser, no cookie
 * and no Clerk instance in a test process — the real `auth()` has nothing to
 * read. Fixing the answer here is also what makes the assertions below mean
 * something: the routes write as this person and the repository is read back as
 * the same person, so anything a route stored where this person cannot see it
 * fails the test rather than passing unnoticed.
 *
 * The name starts with `MOCK` because Vitest hoists this call above the `const`
 * and only lets a factory reference outer variables that are named that way.
 */
const MOCK_OWNER_ID = "user_test_api";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: MOCK_OWNER_ID }),
}));

// HN source makes real network calls. Return nothing in tests so the capture
// idempotency assertion (created = 0 on a pre-seeded corpus) stays deterministic.
vi.mock("@/lib/sources/hn", () => ({
  hnSource: {
    id: "hn-who-is-hiring",
    name: "Hacker News",
    kind: "community",
    capabilities: () => ({ requiresCredentials: false, live: true, notes: "mocked in tests" }),
    health: async () => ({ providerId: "hn-who-is-hiring", available: true, detail: "mocked", checkedAt: new Date().toISOString() }),
    search: async () => ({ status: "SUCCESS", detail: "mocked — no network calls in tests", signals: [] }),
  },
}));

let listRoute: typeof import("@/app/api/opportunities/[id]/route");
let activitiesRoute: typeof import("@/app/api/opportunities/[id]/activities/route");
let outcomeRoute: typeof import("@/app/api/opportunities/[id]/outcome/route");
let partnerRoute: typeof import("@/app/api/opportunities/[id]/partner/route");
let decisionRoute: typeof import("@/app/api/opportunities/[id]/partner/decision/route");
let captureRoute: typeof import("@/app/api/capture/route");
let repo: typeof import("@/lib/data/repository");

function json(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Next 16 passes route params as a promise; handlers await it. */
function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeAll(async () => {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
  listRoute = await import("@/app/api/opportunities/[id]/route");
  activitiesRoute = await import("@/app/api/opportunities/[id]/activities/route");
  outcomeRoute = await import("@/app/api/opportunities/[id]/outcome/route");
  partnerRoute = await import("@/app/api/opportunities/[id]/partner/route");
  decisionRoute = await import("@/app/api/opportunities/[id]/partner/decision/route");
  captureRoute = await import("@/app/api/capture/route");
  repo = await import("@/lib/data/repository");
  await repo.ensureReady(MOCK_OWNER_ID);
});

async function firstOpportunityId(): Promise<string> {
  const items = await repo.listOpportunities(MOCK_OWNER_ID);
  return items[0].id;
}

describe("opportunity routes", () => {
  it("returns an opportunity by id and 404s otherwise", async () => {
    const id = await firstOpportunityId();
    const found = await listRoute.GET(new Request("http://localhost"), ctx(id));
    expect(found.status).toBe(200);
    const missing = await listRoute.GET(new Request("http://localhost"), ctx("does-not-exist"));
    expect(missing.status).toBe(404);
  });

  it("validates the status it is given", async () => {
    const id = await firstOpportunityId();
    const bad = await listRoute.PATCH(json({ status: "SUPER_QUALIFIED" }), ctx(id));
    expect(bad.status).toBe(400);

    const good = await listRoute.PATCH(json({ status: "QUALIFIED", note: "Evidence checks out" }), ctx(id));
    expect(good.status).toBe(200);
    const body = (await good.json()) as { opportunity: { status: string } };
    expect(body.opportunity.status).toBe("QUALIFIED");
  });

  it("rejects an unknown activity kind and accepts a valid one", async () => {
    const id = await firstOpportunityId();
    const bad = await activitiesRoute.POST(json({ kind: "SING", summary: "x" }), ctx(id));
    expect(bad.status).toBe(400);

    const empty = await activitiesRoute.POST(json({ kind: "NOTE", summary: "  " }), ctx(id));
    expect(empty.status).toBe(400);

    const good = await activitiesRoute.POST(json({ kind: "ACTION", summary: "Sent the scoped reply" }), ctx(id));
    expect(good.status).toBe(201);
    const opportunity = await repo.getOpportunity(MOCK_OWNER_ID, id);
    expect(opportunity!.activities.some((activity) => activity.summary === "Sent the scoped reply")).toBe(true);
  });

  it("validates outcomes and moves the opportunity to ACTIVE on a reply", async () => {
    const id = await firstOpportunityId();
    const bad = await outcomeRoute.POST(json({ outcome: "VIBES" }), ctx(id));
    expect(bad.status).toBe(400);

    const good = await outcomeRoute.POST(json({ outcome: "MEETING", note: "Call booked for Thursday" }), ctx(id));
    expect(good.status).toBe(200);
    const opportunity = await repo.getOpportunity(MOCK_OWNER_ID, id);
    expect(opportunity!.outcome).toBe("MEETING");
    expect(opportunity!.status).toBe("ACTIVE");
  });
});

describe("AI deal partner route", () => {
  it("requires a question for intent=ask", async () => {
    const id = await firstOpportunityId();
    const bad = await partnerRoute.POST(json({ intent: "ask", question: "" }), ctx(id));
    expect(bad.status).toBe(400);
  });

  it("returns a grounded recommendation and stores it in the thread", async () => {
    const id = await firstOpportunityId();
    const response = await partnerRoute.POST(json({ intent: "why" }), ctx(id));
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      response: { headline: string; recommendation: string; grounding: string[]; mode: string };
      message: { id: string };
    };
    expect(body.response.grounding.length).toBeGreaterThan(2);
    expect(body.response.recommendation.length).toBeGreaterThan(20);

    const opportunity = await repo.getOpportunity(MOCK_OWNER_ID, id);
    expect(opportunity!.partnerThread.some((message) => message.id === body.message.id)).toBe(true);
    expect(opportunity!.activities.some((activity) => activity.kind === "AI_RECOMMENDATION")).toBe(true);
  });

  it("interprets a prospect reply using the deterministic reader when no provider is configured", async () => {
    const id = await firstOpportunityId();
    const response = await partnerRoute.POST(
      json({ intent: "interpret-reply", prospectReply: "Not now — we may revisit next quarter. Thanks." }),
      ctx(id),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { response: { headline: string; recommendation: string } };
    expect(body.response.headline.toLowerCase()).toContain("negative");
    expect(body.response.recommendation.length).toBeGreaterThan(20);
  });

  it("records an operator decision on a partner message", async () => {
    const id = await firstOpportunityId();
    const created = await partnerRoute.POST(json({ intent: "opening-message" }), ctx(id));
    const body = (await created.json()) as { message: { id: string } };

    const rejected = await decisionRoute.POST(json({ messageId: body.message.id, decision: "maybe" }), ctx(id));
    expect(rejected.status).toBe(400);

    const accepted = await decisionRoute.POST(json({ messageId: body.message.id, decision: "edited" }), ctx(id));
    expect(accepted.status).toBe(201);
    const opportunity = await repo.getOpportunity(MOCK_OWNER_ID, id);
    const message = opportunity!.partnerThread.find((entry) => entry.id === body.message.id);
    expect(message!.decision).toBe("edited");
  });
});

describe("capture route", () => {
  it("reports the funnel, the sources, and creates nothing twice", async () => {
    const response = await captureRoute.POST(json({ intent: "AI internal tools and automation" }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      created: number;
      observed: number;
      kept: number;
      rejected: Array<{ rule: string }>;
      runs: Array<{ sourceName: string; status: string }>;
    };
    expect(body.observed).toBeGreaterThanOrEqual(9);
    expect(body.kept).toBeGreaterThanOrEqual(9);
    expect(body.rejected.length).toBeGreaterThanOrEqual(3);
    expect(body.runs.some((run) => run.sourceName === "Reviewed capture corpus")).toBe(true);
    expect(body.created).toBe(0);
  });
});
