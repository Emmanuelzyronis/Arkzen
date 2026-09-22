import { randomUUID } from "node:crypto";
import { buildOpportunities, fingerprintSignal, type RejectedSignal } from "@/lib/domain/pipeline";
import type { RunStatus } from "@/lib/sources/types";
import { acquireAll } from "@/lib/sources";
import { corpusSource } from "@/lib/sources/corpus-source";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import type {
  Activity,
  PartnerResponse,
  CandidateSignal,
  Opportunity,
  OpportunityStatus,
  OutcomeKind,
  PartnerMessage,
  ScoredOpportunity,
  ServiceProfile,
} from "@/lib/domain/types";
import { getDriver, driverKind } from "./driver";
import { migrate } from "./migrations";
import type { SqlDriver } from "./types";

/**
 * One in-flight readiness promise per owner.
 *
 * Keyed by owner rather than held as a single promise because the seed is per
 * person: everyone's first visit gets them their own copy of the reviewed
 * corpus. The promise (rather than a flag) is what keeps that safe. A page asks
 * for several things at once — `Promise.all([listOpportunities(), …])` — so
 * without memoizing the *whole* seed, two concurrent first requests would both
 * count zero, both seed, and the owner would open their new workspace to
 * duplicate activities. Activities have no uniqueness to fall back on the way
 * opportunities do.
 */
const readyByOwner = new Map<string, Promise<void>>();

/** Schema is global, so it is migrated once for the process, not once per owner. */
let migratedPromise: Promise<void> | null = null;

function ensureMigrated(): Promise<void> {
  if (!migratedPromise) {
    migratedPromise = (async () => {
      const driver = await getDriver();
      await migrate(driver);
    })().catch((error) => {
      migratedPromise = null;
      throw error;
    });
  }
  return migratedPromise;
}

export async function ensureReady(ownerId: string): Promise<void> {
  let pending = readyByOwner.get(ownerId);
  if (!pending) {
    pending = (async () => {
      await ensureMigrated();
      const driver = await getDriver();
      // Counted for this owner, not for the table: an empty workspace is what
      // seeds, and someone signing in to a database that already holds other
      // people's leads must still get their own.
      const rows = await driver.query<{ count: number | string }>(
        "select count(*) as count from opportunities where owner_id = ?",
        [ownerId],
      );
      const count = Number(rows[0]?.count ?? 0);
      if (count === 0) await seedFromCorpus(driver, ownerId);
    })().catch((error) => {
      readyByOwner.delete(ownerId);
      throw error;
    });
    readyByOwner.set(ownerId, pending);
  }
  return pending;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Initial review states for the seeded corpus so the feed reflects real work. */
const SEED_STATUS: Array<{ match: string; status: OpportunityStatus; outcome?: OutcomeKind }> = [
  { match: "corpus:multitenant-rails-004", status: "ACTIVE" },
  { match: "corpus:nextjs-marketing-site-005", status: "WON", outcome: "WON" },
  { match: "corpus:nonprofit-grant-report-009", status: "LOST", outcome: "LOST" },
  { match: "corpus:noise-selfpromo-013", status: "REVIEWING" },
];

async function seedFromCorpus(driver: SqlDriver, ownerId: string): Promise<void> {
  const startedAt = nowIso();
  const { signals, runs } = await acquireCorpus(defaultServiceProfile);
  const result = buildOpportunities(signals, defaultServiceProfile);
  const inserted = await insertOpportunities(ownerId, result.opportunities, driver);

  const seededActivities: Array<Omit<Activity, "id" | "createdAt" | "opportunityId">> = [];
  for (const opportunity of result.opportunities) {
    const seed = SEED_STATUS.find((entry) => entry.match === opportunity.signal.sourceObjectId);
    if (seed && seed.status !== "NEW") {
      seededActivities.push({
        kind: "STATUS_CHANGE",
        actor: "operator",
        summary: `Reviewed and moved to ${seed.status}`,
        detail:
          seed.status === "WON"
            ? "Signed after a two-week scoping call. Kept for reference on pricing and delivery shape."
            : seed.status === "LOST"
              ? "Budget did not stretch to a paid first version. Logged so the pattern is visible."
              : "Operator is working this opportunity now.",
        statusFrom: "NEW",
        statusTo: seed.status,
      });
    }
  }

  for (const activity of seededActivities) {
    const opportunity = result.opportunities.find((entry) =>
      activity.statusTo === "WON" ? entry.signal.sourceObjectId === "corpus:nextjs-marketing-site-005"
      : activity.statusTo === "LOST" ? entry.signal.sourceObjectId === "corpus:nonprofit-grant-report-009"
      : entry.signal.sourceObjectId === "corpus:multitenant-rails-004",
    );
    if (!opportunity) continue;
    await insertActivity(
      ownerId,
      {
        opportunityId: opportunity.id,
        kind: activity.kind,
        actor: activity.actor,
        summary: activity.summary,
        detail: activity.detail ?? null,
        statusFrom: activity.statusFrom ?? null,
        statusTo: activity.statusTo ?? null,
      },
      driver,
    );
  }

  await recordSourceHealth(
    ownerId,
    runs.map((run) => ({
      providerId: run.sourceId,
      available: run.status === "SUCCESS" || run.status === "PARTIAL_SUCCESS",
      detail: run.detail,
      checkedAt: new Date().toISOString(),
    })),
    driver,
  );

  await recordAcquisitionRun(
    ownerId,
    {
      startedAt,
      completedAt: nowIso(),
      status: runs.every((run) => run.status === "SUCCESS") ? "SUCCESS" : "PARTIAL_SUCCESS",
      detail: "Initial capture run: corpus replayed through the full pipeline.",
      observed: result.observed,
      kept: result.opportunities.length,
      rejected: result.rejected.length,
      duplicates: result.duplicates,
      created: inserted.length,
      sourceRuns: runs.map((run) => ({
        sourceId: run.sourceId,
        sourceName: run.sourceName,
        status: run.status,
        detail: run.detail,
        count: run.count,
      })),
    },
    driver,
  );
}

/**
 * Seeding replays the reviewed corpus only: it is deterministic, instant, and
 * makes no third-party request. Live sources are queried on demand from the
 * Capture screen, where a slow or blocked provider is visible to the operator.
 */
async function acquireCorpus(profile: ServiceProfile) {
  const result = await corpusSource.search(profile, 100);
  return {
    signals: result.signals,
    runs: [
      {
        sourceId: corpusSource.id,
        sourceName: corpusSource.name,
        status: result.status,
        detail: result.detail,
        count: result.signals.length,
        durationMs: 0,
      },
    ],
  };
}

/**
 * Writes the opportunities that are not already stored, and returns exactly
 * those.
 *
 * Returning the rows rather than a count is the point. The caller has to attach
 * a "captured live from …" activity to each newly stored opportunity, and a
 * count cannot say *which* ones those were: duplicates are skipped by
 * fingerprint part-way through the loop, so as soon as anything is already
 * stored the first N entries of the input are not the N rows that were
 * inserted. The activity then lands on the wrong lead, and the caller's
 * response names the wrong records. That is invisible on a freshly seeded
 * database, where nothing is skipped and the two happen to agree.
 *
 * `on conflict (fingerprint) do nothing … returning id` makes the check and the
 * write a single statement. The previous version selected first and inserted
 * after an `await`, so two concurrent captures could both see nothing, both
 * insert, and one would throw on the unique index.
 */
export async function insertOpportunities(
  ownerId: string,
  opportunities: ScoredOpportunity[],
  driverOverride?: SqlDriver,
): Promise<ScoredOpportunity[]> {
  // Only on the public path. `seedFromCorpus` passes the driver it was handed
  // from inside `ensureReady()`, so awaiting `ensureReady()` there would wait on
  // the very promise that is running — a deadlock, not a no-op.
  if (!driverOverride) await ensureReady(ownerId);

  const driver = driverOverride ?? (await getDriver());
  const inserted: ScoredOpportunity[] = [];
  const seen = new Set<string>();

  for (const opportunity of opportunities) {
    const fingerprint = fingerprintSignal(opportunity.signal);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const timestamp = nowIso();
    const seed = SEED_STATUS.find((entry) => entry.match === opportunity.signal.sourceObjectId);
    // `query`, not `run`: the empty result on conflict is how we learn the row
    // was already there. `run` returns nothing and could not tell us.
    const rows = await driver.query<{ id: string }>(
      `insert into opportunities (
        id, owner_id, source_object_id, source_kind, source_name, source_url, author_handle,
        title, content, published_at, captured_at, provider_id, data_kind, category,
        need_summary, intent_summary, score, band, status, outcome, outcome_note,
        payload, fingerprint, created_at, updated_at
      ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      on conflict (owner_id, fingerprint) do nothing
      returning id`,
      [
        opportunity.id,
        ownerId,
        opportunity.signal.sourceObjectId,
        opportunity.signal.sourceKind,
        opportunity.signal.sourceName,
        opportunity.signal.canonicalUrl,
        opportunity.signal.author.handle,
        opportunity.signal.title,
        opportunity.signal.content,
        opportunity.signal.publishedAt,
        opportunity.signal.capturedAt,
        opportunity.signal.providerId,
        opportunity.signal.dataKind,
        opportunity.category,
        opportunity.needSummary,
        opportunity.intentSummary,
        opportunity.score,
        opportunity.band,
        seed?.status ?? "NEW",
        seed?.outcome ?? null,
        null,
        JSON.stringify(opportunity),
        fingerprint,
        timestamp,
        timestamp,
      ],
    );
    if (rows.length === 0) continue;

    await insertActivity(
      ownerId,
      {
        opportunityId: opportunity.id,
        kind: "DISCOVERED",
        actor: "arkzen",
        summary: `Discovered in ${opportunity.signal.sourceName}`,
        detail: opportunity.matchReason,
        statusFrom: null,
        statusTo: "NEW",
        meta: { score: opportunity.score, band: opportunity.band, provider: opportunity.signal.providerId },
      },
      driver,
    );
    inserted.push(opportunity);
  }

  return inserted;
}

interface OpportunityRow {
  id: string;
  status: OpportunityStatus;
  outcome: OutcomeKind | null;
  outcome_note: string | null;
  payload: string;
  created_at: string;
  updated_at: string;
}

function hydrate(row: OpportunityRow, activities: Activity[], partnerThread: PartnerMessage[]): Opportunity {
  const scored = JSON.parse(row.payload) as ScoredOpportunity;
  return {
    ...scored,
    status: row.status,
    outcome: row.outcome,
    outcomeNote: row.outcome_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    activities,
    partnerThread,
  };
}

export interface OpportunityListItem {
  id: string;
  title: string;
  needSummary: string;
  intentSummary: string;
  score: number;
  band: ScoredOpportunity["band"];
  status: OpportunityStatus;
  outcome: OutcomeKind | null;
  category: string;
  sourceName: string;
  sourceUrl: string;
  authorHandle: string;
  dataKind: string;
  publishedAt: string;
  capturedAt: string;
  updatedAt: string;
  reasons: string[];
  risks: string[];
  nextAction: ScoredOpportunity["nextAction"];
  qualification: ScoredOpportunity["qualification"];
  fitValue: number;
  intentValue: number;
  urgencyValue: number;
  reachabilityValue: number;
}

function toListItem(scored: ScoredOpportunity, row: { status: OpportunityStatus; outcome: OutcomeKind | null; updated_at: string; published_at: string; captured_at: string }): OpportunityListItem {
  return {
    id: scored.id,
    title: scored.signal.title,
    needSummary: scored.needSummary,
    intentSummary: scored.intentSummary,
    score: scored.score,
    band: scored.band,
    status: row.status,
    outcome: row.outcome,
    category: scored.category,
    sourceName: scored.signal.sourceName,
    sourceUrl: scored.signal.canonicalUrl,
    authorHandle: scored.signal.author.handle,
    dataKind: scored.signal.dataKind,
    publishedAt: row.published_at,
    capturedAt: row.captured_at,
    updatedAt: row.updated_at,
    reasons: scored.reasons,
    risks: scored.risks,
    nextAction: scored.nextAction,
    qualification: scored.qualification,
    fitValue: scored.fit.value,
    intentValue: scored.intent.value,
    urgencyValue: scored.urgency.value,
    reachabilityValue: scored.reachability.value,
  };
}

export async function listOpportunities(ownerId: string): Promise<OpportunityListItem[]> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const rows = await driver.query<{
    id: string;
    status: OpportunityStatus;
    outcome: OutcomeKind | null;
    payload: string;
    updated_at: string;
    published_at: string;
    captured_at: string;
  }>(
    "select id, status, outcome, payload, updated_at, published_at, captured_at from opportunities where owner_id = ?",
    [ownerId],
  );

  return rows
    .map((row) =>
      toListItem(JSON.parse(row.payload) as ScoredOpportunity, {
        status: row.status,
        outcome: row.outcome,
        updated_at: row.updated_at,
        published_at: row.published_at,
        captured_at: row.captured_at,
      }),
    )
    .sort((a, b) => b.score - a.score);
}

export async function getOpportunity(ownerId: string, id: string): Promise<Opportunity | null> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const rows = await driver.query<OpportunityRow>(
    "select id, status, outcome, outcome_note, payload, created_at, updated_at from opportunities where id = ? and owner_id = ?",
    [id, ownerId],
  );
  if (rows.length === 0) return null;
  const [activities, partnerThread] = await Promise.all([
    listActivities(ownerId, id),
    listPartnerMessages(ownerId, id),
  ]);
  return hydrate(rows[0], activities, partnerThread);
}

export async function listActivities(ownerId: string, opportunityId: string): Promise<Activity[]> {
  const driver = await getDriver();
  const rows = await driver.query<{
    id: string;
    opportunity_id: string;
    kind: Activity["kind"];
    actor: Activity["actor"];
    summary: string;
    detail: string | null;
    status_from: OpportunityStatus | null;
    status_to: OpportunityStatus | null;
    meta: string | null;
    created_at: string;
  }>(
    `select id, opportunity_id, kind, actor, summary, detail, status_from, status_to, meta, created_at
     from activities where opportunity_id = ? and owner_id = ? order by created_at asc`,
    [opportunityId, ownerId],
  );
  return rows.map((row) => ({
    id: row.id,
    opportunityId: row.opportunity_id,
    kind: row.kind,
    actor: row.actor,
    summary: row.summary,
    detail: row.detail,
    statusFrom: row.status_from,
    statusTo: row.status_to,
    createdAt: row.created_at,
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
  }));
}

export async function insertActivity(
  ownerId: string,
  input: {
    opportunityId: string;
    kind: Activity["kind"];
    actor: Activity["actor"];
    summary: string;
    detail?: string | null;
    statusFrom?: OpportunityStatus | null;
    statusTo?: OpportunityStatus | null;
    meta?: Record<string, unknown> | null;
  },
  driverOverride?: SqlDriver,
): Promise<Activity> {
  // Only on the public path — see the note in `insertOpportunities`. Both
  // writers are reachable from the API without going through a read first, so
  // without this a capture against a fresh database throws
  // `no such table: opportunities` instead of migrating and seeding.
  if (!driverOverride) await ensureReady(ownerId);

  const driver = driverOverride ?? (await getDriver());
  const activity: Activity = {
    id: `act_${randomUUID()}`,
    opportunityId: input.opportunityId,
    kind: input.kind,
    actor: input.actor,
    summary: input.summary,
    detail: input.detail ?? null,
    statusFrom: input.statusFrom ?? null,
    statusTo: input.statusTo ?? null,
    createdAt: nowIso(),
    meta: input.meta ?? null,
  };
  await driver.run(
    `insert into activities (id, owner_id, opportunity_id, kind, actor, summary, detail, status_from, status_to, meta, created_at)
     values (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      activity.id,
      ownerId,
      activity.opportunityId,
      activity.kind,
      activity.actor,
      activity.summary,
      activity.detail,
      activity.statusFrom,
      activity.statusTo,
      activity.meta ? JSON.stringify(activity.meta) : null,
      activity.createdAt,
    ],
  );
  return activity;
}

export async function updateStatus(
  ownerId: string,
  opportunityId: string,
  status: OpportunityStatus,
  note: string | null,
  actor: Activity["actor"] = "operator",
): Promise<Opportunity | null> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  // Owner-scoped, so another person's lead reads as missing rather than being
  // readable and writable by whoever guesses its id.
  const current = await getOpportunity(ownerId, opportunityId);
  if (!current) return null;
  if (current.status !== status) {
    await driver.run("update opportunities set status = ?, updated_at = ? where id = ? and owner_id = ?", [
      status,
      nowIso(),
      opportunityId,
      ownerId,
    ]);
    await insertActivity(
      ownerId,
      {
        opportunityId,
        kind: "STATUS_CHANGE",
        actor,
        summary: `Moved from ${current.status} to ${status}`,
        detail: note,
        statusFrom: current.status,
        statusTo: status,
      },
      driver,
    );
  } else if (note) {
    await insertActivity(
      ownerId,
      { opportunityId, kind: "NOTE", actor, summary: note, detail: null },
      driver,
    );
  }
  return getOpportunity(ownerId, opportunityId);
}

export async function recordOutcome(
  ownerId: string,
  opportunityId: string,
  outcome: OutcomeKind,
  note: string | null,
): Promise<Opportunity | null> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const current = await getOpportunity(ownerId, opportunityId);
  if (!current) return null;
  const status: OpportunityStatus =
    outcome === "WON"
      ? "WON"
      : outcome === "LOST" || outcome === "DISQUALIFIED" || outcome === "UNREACHABLE"
        ? "LOST"
        : outcome === "REPLIED" || outcome === "CONVERSATION" || outcome === "MEETING" || outcome === "PROPOSAL"
          ? "ACTIVE"
          : current.status;

  await driver.run(
    "update opportunities set outcome = ?, outcome_note = ?, status = ?, updated_at = ? where id = ? and owner_id = ?",
    [outcome, note, status, nowIso(), opportunityId, ownerId],
  );
  await insertActivity(
    ownerId,
    {
      opportunityId,
      kind: "OUTCOME",
      actor: "operator",
      summary: `Outcome recorded: ${outcome.replace(/_/g, " ").toLowerCase()}`,
      detail: note,
      statusFrom: current.status,
      statusTo: status,
      meta: { outcome },
    },
    driver,
  );
  return getOpportunity(ownerId, opportunityId);
}

export async function listPartnerMessages(
  ownerId: string,
  opportunityId: string,
): Promise<PartnerMessage[]> {
  const driver = await getDriver();
  const rows = await driver.query<{
    id: string;
    opportunity_id: string;
    role: PartnerMessage["role"];
    content: string;
    grounding: string;
    provider: string;
    decision: PartnerMessage["decision"];
    decision_note: string | null;
    payload: string | null;
    created_at: string;
  }>(
    `select id, opportunity_id, role, content, grounding, provider, decision, decision_note, payload, created_at
     from partner_messages where opportunity_id = ? and owner_id = ? order by created_at asc`,
    [opportunityId, ownerId],
  );
  return rows.map((row) => ({
    id: row.id,
    opportunityId: row.opportunity_id,
    role: row.role,
    content: row.content,
    payload: row.payload ? (JSON.parse(row.payload) as PartnerResponse) : null,
    grounding: JSON.parse(row.grounding) as string[],
    provider: row.provider,
    decision: row.decision,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  }));
}

/**
 * One lead's conversation, as the assistant's rail lists it.
 *
 * Not the messages — those are `listPartnerMessages(id)`, one lead at a time.
 * This is the index of which leads have one.
 */
export interface Conversation {
  opportunityId: string;
  /** The lead's own headline, so the rail names it the way every other list does. */
  title: string;
  /** When the last thing was said. The rail sorts on this. */
  lastAt: string;
  /** How many messages, counting both sides. */
  messages: number;
  /**
   * The last thing said, verbatim.
   *
   * Verbatim, and deliberately not a preview: cutting it to one line is a
   * display decision, and this layer stores data rather than formatting it.
   * `previewOf` in `lib/assistant.ts` does the cutting.
   */
  lastMessage: string;
}

/**
 * Every conversation there has ever been, most recently spoken in first.
 *
 * `/assistant` needs this and there was no query behind it: `listPartnerMessages`
 * takes a single opportunity id, so nothing could ask "which leads have I talked
 * about?". Read-only — it selects from two tables and writes to neither.
 *
 * Grouped in JS rather than in SQL. `group by … max(created_at)` would give the
 * count and the time but not the last message's text, which the rail shows; the
 * last row per group means a window function or a correlated subquery. Both are
 * portable, but neither removes the pass over the rows that grouping does
 * anyway, so the simpler pair of selects wins.
 *
 * Counted in JS for a second reason too, and this one is not a preference:
 * `count(*)` comes back from Postgres as a **string**, because `pg` returns
 * `bigint` that way to avoid losing precision past 2^53. SQLite hands back a
 * number. A `count(*) as messages` here would type-check against this interface
 * and then put `"4"` on the screen in production and `4` in tests.
 */
export async function listConversations(ownerId: string): Promise<Conversation[]> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const [messages, titles] = await Promise.all([
    driver.query<{ opportunity_id: string; content: string; created_at: string }>(
      `select opportunity_id, content, created_at from partner_messages where owner_id = ? order by created_at asc`,
      [ownerId],
    ),
    driver.query<{ id: string; title: string }>(
      `select id, title from opportunities where owner_id = ?`,
      [ownerId],
    ),
  ]);

  const named = new Map(titles.map((row) => [row.id, row.title]));
  const byLead = new Map<string, Conversation>();

  for (const row of messages) {
    const started = byLead.get(row.opportunity_id);
    byLead.set(row.opportunity_id, {
      opportunityId: row.opportunity_id,
      // A message whose lead has since been deleted still gets a row rather
      // than vanishing: the conversation happened, and hiding it would make the
      // rail quietly disagree with the history kept on the lead itself.
      title: named.get(row.opportunity_id) ?? "A lead that is no longer here",
      lastAt: row.created_at,
      messages: (started?.messages ?? 0) + 1,
      lastMessage: row.content,
    });
  }

  return [...byLead.values()].sort((left, right) => (left.lastAt < right.lastAt ? 1 : -1));
}

export async function insertPartnerMessage(
  ownerId: string,
  input: {
    opportunityId: string;
    role: PartnerMessage["role"];
    content: string;
    grounding: string[];
    provider: string;
    payload?: PartnerResponse | null;
  },
): Promise<PartnerMessage> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const message: PartnerMessage = {
    id: `msg_${randomUUID()}`,
    opportunityId: input.opportunityId,
    role: input.role,
    content: input.content,
    payload: input.payload ?? null,
    grounding: input.grounding,
    provider: input.provider,
    decision: null,
    decisionNote: null,
    createdAt: nowIso(),
  };
  await driver.run(
    `insert into partner_messages (id, owner_id, opportunity_id, role, content, grounding, provider, decision, decision_note, payload, created_at)
     values (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      message.id,
      ownerId,
      message.opportunityId,
      message.role,
      message.content,
      JSON.stringify(message.grounding),
      message.provider,
      null,
      null,
      message.payload ? JSON.stringify(message.payload) : null,
      message.createdAt,
    ],
  );
  return message;
}

/**
 * Records the operator's decision on a drafted message.
 *
 * Scoped by opportunity as well as message id, and reports whether it matched.
 * A message id on its own is a global key: the route checked that the
 * *opportunity* existed, then updated a message belonging to whichever
 * opportunity actually owned that id — so a decision posted against lead B
 * silently rewrote a message on lead A, and B's timeline recorded a decision
 * about a draft it had never seen. Both records were wrong and neither said so.
 *
 * Returns false when nothing matched, so the caller can answer 404 rather than
 * the 201 that "we updated zero rows" used to produce.
 */
export async function decidePartnerMessage(
  ownerId: string,
  opportunityId: string,
  messageId: string,
  decision: "accepted" | "edited" | "rejected",
  note: string | null,
): Promise<boolean> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const matched = await driver.query<{ id: string }>(
    `update partner_messages set decision = ?, decision_note = ?
     where id = ? and opportunity_id = ? and owner_id = ?
     returning id`,
    [decision, note, messageId, opportunityId, ownerId],
  );
  return matched.length > 0;
}

export async function recordAcquisitionRun(
  ownerId: string,
  run: {
    startedAt: string;
    completedAt: string;
    status: RunStatus | "SUCCESS" | "PARTIAL_SUCCESS";
    detail: string;
    observed: number;
    kept: number;
    rejected: number;
    duplicates: number;
    created: number;
    sourceRuns: Array<{ sourceId: string; sourceName: string; status: string; detail: string; count: number }>;
  },
  driverOverride?: SqlDriver,
): Promise<void> {
  const driver = driverOverride ?? (await getDriver());
  await driver.run(
    `insert into acquisition_runs (id, owner_id, started_at, completed_at, status, detail, observed, kept, rejected, duplicates, created, source_runs)
     values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      `run_${randomUUID()}`,
      ownerId,
      run.startedAt,
      run.completedAt,
      run.status,
      run.detail,
      run.observed,
      run.kept,
      run.rejected,
      run.duplicates,
      run.created,
      JSON.stringify(run.sourceRuns),
    ],
  );
}

export async function listAcquisitionRuns(ownerId: string, limit = 10) {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const rows = await driver.query<{
    id: string;
    started_at: string;
    completed_at: string;
    status: string;
    detail: string;
    observed: number;
    kept: number;
    rejected: number;
    duplicates: number;
    created: number;
    source_runs: string;
  }>(
    `select id, started_at, completed_at, status, detail, observed, kept, rejected, duplicates, created, source_runs
     from acquisition_runs where owner_id = ? order by completed_at desc limit ?`,
    [ownerId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    detail: row.detail,
    observed: Number(row.observed),
    kept: Number(row.kept),
    rejected: Number(row.rejected),
    duplicates: Number(row.duplicates),
    created: Number(row.created),
    sourceRuns: JSON.parse(row.source_runs) as Array<{
      sourceId: string;
      sourceName: string;
      status: string;
      detail: string;
      count: number;
    }>,
  }));
}

export async function recordSourceHealth(
  ownerId: string,
  entries: Array<{ providerId: string; available: boolean; detail: string; checkedAt: string }>,
  driverOverride?: SqlDriver,
): Promise<void> {
  const driver = driverOverride ?? (await getDriver());
  for (const entry of entries) {
    await driver.run(
      `insert into source_health (owner_id, provider_id, available, detail, checked_at) values (?,?,?,?,?)
       on conflict (owner_id, provider_id) do update set available = excluded.available, detail = excluded.detail, checked_at = excluded.checked_at`,
      [ownerId, entry.providerId, entry.available ? 1 : 0, entry.detail, entry.checkedAt],
    );
  }
}

export async function listSourceHealth(ownerId: string) {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const rows = await driver.query<{
    provider_id: string;
    available: number | boolean;
    detail: string;
    checked_at: string;
  }>("select provider_id, available, detail, checked_at from source_health where owner_id = ?", [
    ownerId,
  ]);
  return rows.map((row) => ({
    providerId: row.provider_id,
    available: Boolean(row.available),
    detail: row.detail,
    checkedAt: row.checked_at,
  }));
}

export interface Insights {
  total: number;
  byStatus: Record<string, number>;
  byBand: Record<string, number>;
  byCategory: Record<string, number>;
  byOutcome: Record<string, number>;
  averageScore: number;
  responseRate: number;
  winRate: number;
  runs: Awaited<ReturnType<typeof listAcquisitionRuns>>;
  storage: string;
}

export async function getInsights(ownerId: string): Promise<Insights> {
  await ensureReady(ownerId);
  const driver = await getDriver();
  const items = await listOpportunities(ownerId);
  const runs = await listAcquisitionRuns(ownerId, 5);

  const byStatus: Record<string, number> = {};
  const byBand: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byOutcome: Record<string, number> = {};

  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    byBand[item.band] = (byBand[item.band] ?? 0) + 1;
    byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
    if (item.outcome) byOutcome[item.outcome] = (byOutcome[item.outcome] ?? 0) + 1;
  }

  const engaged = items.filter((item) => item.status === "ACTIVE" || item.status === "WON" || item.status === "LOST");
  const responded = items.filter((item) =>
    ["REPLIED", "CONVERSATION", "MEETING", "PROPOSAL", "WON"].includes(item.outcome ?? ""),
  );
  const won = items.filter((item) => item.outcome === "WON").length;

  return {
    total: items.length,
    byStatus,
    byBand,
    byCategory,
    byOutcome,
    averageScore: items.length
      ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
      : 0,
    responseRate: engaged.length ? Math.round((responded.length / engaged.length) * 100) : 0,
    winRate: engaged.length ? Math.round((won / engaged.length) * 100) : 0,
    runs,
    storage: driverKind() === "postgres" ? "Postgres" : "SQLite",
  };
}

export type { RejectedSignal };
export { buildOpportunities };

// ---------------------------------------------------------------------------
// Service profile
// ---------------------------------------------------------------------------

function profileFromRow(row: {
  id: string;
  name: string;
  description: string;
  capabilities: string;
  keywords: string;
  negative_signals: string;
  locations: string;
  minimum_engagement: string | null;
}): ServiceProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    capabilities: JSON.parse(row.capabilities) as string[],
    keywords: JSON.parse(row.keywords) as string[],
    negativeSignals: JSON.parse(row.negative_signals) as string[],
    locations: JSON.parse(row.locations) as string[],
    minimumEngagement: row.minimum_engagement ?? undefined,
  };
}

export async function getServiceProfile(ownerId: string): Promise<ServiceProfile | null> {
  await ensureMigrated();
  const driver = await getDriver();
  const rows = await driver.query<{
    id: string;
    name: string;
    description: string;
    capabilities: string;
    keywords: string;
    negative_signals: string;
    locations: string;
    minimum_engagement: string | null;
  }>(
    `select id, name, description, capabilities, keywords, negative_signals, locations, minimum_engagement
     from service_profiles where owner_id = ?`,
    [ownerId],
  );
  return rows.length > 0 ? profileFromRow(rows[0]) : null;
}

export async function upsertServiceProfile(
  ownerId: string,
  data: {
    name: string;
    description: string;
    capabilities: string[];
    keywords: string[];
    negativeSignals: string[];
    locations: string[];
    minimumEngagement?: string;
  },
): Promise<ServiceProfile> {
  await ensureMigrated();
  const driver = await getDriver();
  const existing = await getServiceProfile(ownerId);
  const id = existing?.id ?? `profile_${randomUUID()}`;
  const now = nowIso();

  await driver.run(
    `insert into service_profiles (id, owner_id, name, description, capabilities, keywords, negative_signals, locations, minimum_engagement, created_at, updated_at)
     values (?,?,?,?,?,?,?,?,?,?,?)
     on conflict (owner_id) do update set
       name = excluded.name,
       description = excluded.description,
       capabilities = excluded.capabilities,
       keywords = excluded.keywords,
       negative_signals = excluded.negative_signals,
       locations = excluded.locations,
       minimum_engagement = excluded.minimum_engagement,
       updated_at = excluded.updated_at`,
    [
      id,
      ownerId,
      data.name,
      data.description,
      JSON.stringify(data.capabilities),
      JSON.stringify(data.keywords),
      JSON.stringify(data.negativeSignals),
      JSON.stringify(data.locations),
      data.minimumEngagement ?? null,
      now,
      now,
    ],
  );

  return {
    id,
    name: data.name,
    description: data.description,
    capabilities: data.capabilities,
    keywords: data.keywords,
    negativeSignals: data.negativeSignals,
    locations: data.locations,
    minimumEngagement: data.minimumEngagement,
  };
}
