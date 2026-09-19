import { beforeAll, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import Database from "better-sqlite3";

const dbPath = "/tmp/arkzen-test-migration.sqlite3";
process.env.ARKZEN_SQLITE_PATH = dbPath;
delete process.env.DATABASE_URL;
delete process.env.POSTGRES_URL;

/**
 * The one-time wipe, tested on a database shaped like the one in production.
 *
 * `migrate()` drops every table when it finds the old single-tenant schema and
 * rebuilds it owned. This is the only code in the change that destroys rows, it
 * runs automatically on the first request after deploy, and it cannot be undone —
 * so it is written against a real copy of the old schema here rather than being
 * trusted.
 *
 * The old schema below is deliberately hand-written and not imported. Importing
 * the pre-change definitions would mean the test agreed with the code by
 * construction; the point is to be an independent record of what the deployed
 * database actually looks like.
 */
const OLD_SCHEMA = [
  `create table opportunities (
     id text primary key, source_object_id text not null, source_kind text not null,
     source_name text not null, source_url text not null, author_handle text not null,
     title text not null, content text not null, published_at text not null,
     captured_at text not null, provider_id text not null, data_kind text not null,
     category text not null, need_summary text not null, intent_summary text not null,
     score integer not null, band text not null, status text not null, outcome text,
     outcome_note text, payload text not null, fingerprint text not null,
     created_at text not null, updated_at text not null
   )`,
  `create unique index opportunities_fingerprint on opportunities(fingerprint)`,
  `create table activities (
     id text primary key, opportunity_id text not null, kind text not null,
     actor text not null, summary text not null, detail text, status_from text,
     status_to text, meta text, created_at text not null
   )`,
  `create table partner_messages (
     id text primary key, opportunity_id text not null, role text not null,
     content text not null, grounding text not null, provider text not null,
     decision text, decision_note text, created_at text not null
   )`,
  `create table acquisition_runs (
     id text primary key, started_at text not null, completed_at text not null,
     status text not null, detail text not null, observed integer not null,
     kept integer not null, rejected integer not null, duplicates integer not null,
     created integer not null, source_runs text not null
   )`,
  `create table source_health (
     provider_id text primary key, available integer not null, detail text not null,
     checked_at text not null
   )`,
];

/** A database with the deployed shape and an operator's real rows in it. */
function writeOldDatabase(): void {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
  const db = new Database(dbPath);
  for (const statement of OLD_SCHEMA) db.exec(statement);

  db.exec(`
    insert into opportunities values
      ('opp_old_1','src_1','job_board','Reviewed capture corpus','https://example.test/1','@someone',
       'Old lead one','Body one','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','corpus','corpus',
       'AI','Need one','Intent one',88,'High','QUALIFIED','REPLIED','They answered','{}','fp1',
       '2026-09-01T00:00:00.000Z','2026-09-02T00:00:00.000Z'),
      ('opp_old_2','src_2','job_board','Reviewed capture corpus','https://example.test/2','@someone',
       'Old lead two','Body two','2026-09-01T00:00:00.000Z','2026-09-01T00:00:00.000Z','corpus','corpus',
       'AI','Need two','Intent two',72,'Medium','WON',null,null,'{}','fp2',
       '2026-09-01T00:00:00.000Z','2026-09-02T00:00:00.000Z');
    insert into activities values
      ('act_old_1','opp_old_1','NOTE','operator','A note the operator wrote',null,null,null,null,
       '2026-09-02T00:00:00.000Z');
    insert into partner_messages values
      ('msg_old_1','opp_old_1','partner','A message','[]','arkzen-reasoning','accepted',null,
       '2026-09-02T00:00:00.000Z');
    insert into acquisition_runs values
      ('run_old_1','2026-09-01T00:00:00.000Z','2026-09-01T00:01:00.000Z','SUCCESS','An old run',
       20,11,9,0,11,'[]');
    insert into source_health values
      ('old_provider',1,'Answered','2026-09-02T00:00:00.000Z');
  `);
  db.close();
}

function columnsOf(table: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  const rows = db.prepare(`select name from pragma_table_info(?)`).all(table) as { name: string }[];
  db.close();
  return rows.map((row) => row.name);
}

function tablesPresent(): string[] {
  const db = new Database(dbPath, { readonly: true });
  const rows = db
    .prepare(`select name from sqlite_master where type = 'table'`)
    .all() as { name: string }[];
  db.close();
  return rows.map((row) => row.name);
}

describe("the move to owned tables", () => {
  beforeAll(() => writeOldDatabase());

  it("replaces the shared schema with the owned one", async () => {
    // The predicates the migration decides on, checked against the fixture
    // before it runs: if these are wrong the drop silently does not happen.
    expect(columnsOf("opportunities")).not.toContain("owner_id");
    expect(tablesPresent()).toContain("opportunities");

    const { migrate } = await import("@/lib/data/migrations");
    const { getDriver } = await import("@/lib/data/driver");
    await migrate(await getDriver());

    for (const table of ["opportunities", "activities", "partner_messages", "acquisition_runs", "source_health"]) {
      expect(columnsOf(table)).toContain("owner_id");
    }
    // The `fingerprint` index is per owner now, so a second person can capture a
    // posting the first person already has.
    const db = new Database(dbPath, { readonly: true });
    const indexes = db
      .prepare(`select name, sql from sqlite_master where type = 'index' and tbl_name = 'opportunities'`)
      .all() as { name: string; sql: string | null }[];
    db.close();
    const fingerprint = indexes.find((index) => index.name === "opportunities_fingerprint");
    expect(fingerprint?.sql).toContain("owner_id");
  });

  it("keeps none of the rows nobody could be shown", async () => {
    // The old rows are unreachable rather than reassigned: there is nothing on
    // them saying whose they were, and guessing would hand one person's captured
    // leads to the next person who signs in.
    const { getDriver } = await import("@/lib/data/driver");
    const driver = await getDriver();
    for (const table of ["opportunities", "activities", "partner_messages", "acquisition_runs", "source_health"]) {
      const rows = await driver.query<{ count: number | string }>(`select count(*) as count from ${table}`);
      expect(Number(rows[0].count)).toBe(0);
    }
  });

  it("is safe to run again, and gives the first person a full workspace", async () => {
    const { migrate } = await import("@/lib/data/migrations");
    const { getDriver } = await import("@/lib/data/driver");
    const driver = await getDriver();
    // Every request calls this, so running it repeatedly has to be a no-op.
    await migrate(driver);
    await migrate(driver);

    const repo = await import("@/lib/data/repository");
    await repo.ensureReady("user_first");
    const mine = await repo.listOpportunities("user_first");
    expect(mine.length).toBeGreaterThanOrEqual(9);
    // A freshly seeded workspace, not the old one back again. The seed does give
    // some corpus leads a finished status on purpose, so the witness is the old
    // operator's own words, which nothing in the corpus could produce.
    expect(mine.map((item) => item.id)).not.toContain("opp_old_1");
    const activities = await driver.query<{ summary: string }>("select summary from activities");
    expect(activities.some((row) => row.summary === "A note the operator wrote")).toBe(false);
    const messages = await driver.query<{ content: string }>("select content from partner_messages");
    expect(messages.some((row) => row.content === "A message")).toBe(false);
  });
});
