import type { SqlDriver } from "./types";

const TABLES = [
  "activities",
  "partner_messages",
  "acquisition_runs",
  "source_health",
  "opportunities",
];

/**
 * Explicit, idempotent schema. Timestamps and JSON payloads are stored as text
 * so the exact same statements run on SQLite and Postgres.
 *
 * Every table carries `owner_id`: the Clerk user the row belongs to. Nothing in
 * this app is shared between signed-in people, so it is not nullable — a row
 * with no owner is a row nobody can see, which is a bug rather than a state.
 *
 * The uniqueness that used to be global is now per owner. `fingerprint` is the
 * dedupe key for a lead, and it has to be unique *within one person's workspace*
 * rather than across the whole table, or the first person to capture a posting
 * would stop everyone else from ever capturing it.
 *
 * The primary key of `opportunities` is `(owner_id, id)` for the same reason,
 * and this one is not theoretical. A lead's id is derived from the posting it
 * came from — `opp_` plus a hash of the source object — so two people capturing
 * the same posting compute the same id. Under a global `id` primary key the
 * second person's seed failed outright with a constraint error, which is how the
 * isolation tests found this. The id in the URL stays the short derived one;
 * what is scoped is which rows it can name.
 */
export const MIGRATIONS: string[] = [
  `create table if not exists opportunities (
     id text not null,
     owner_id text not null,
     source_object_id text not null,
     source_kind text not null,
     source_name text not null,
     source_url text not null,
     author_handle text not null,
     title text not null,
     content text not null,
     published_at text not null,
     captured_at text not null,
     provider_id text not null,
     data_kind text not null,
     category text not null,
     need_summary text not null,
     intent_summary text not null,
     score integer not null,
     band text not null,
     status text not null,
     outcome text,
     outcome_note text,
     payload text not null,
     fingerprint text not null,
     created_at text not null,
     updated_at text not null,
     primary key (owner_id, id)
   )`,
  `create unique index if not exists opportunities_fingerprint on opportunities(owner_id, fingerprint)`,
  `create index if not exists opportunities_owner_idx on opportunities(owner_id, status)`,
  `create index if not exists opportunities_status_idx on opportunities(status)`,
  `create index if not exists opportunities_score_idx on opportunities(score)`,
  `create table if not exists activities (
     id text primary key,
     owner_id text not null,
     opportunity_id text not null,
     kind text not null,
     actor text not null,
     summary text not null,
     detail text,
     status_from text,
     status_to text,
     meta text,
     created_at text not null
   )`,
  `create index if not exists activities_opportunity_idx on activities(owner_id, opportunity_id, created_at)`,
  `create table if not exists partner_messages (
     id text primary key,
     owner_id text not null,
     opportunity_id text not null,
     role text not null,
     content text not null,
     grounding text not null,
     provider text not null,
     decision text,
     decision_note text,
     created_at text not null
   )`,
  `create index if not exists partner_messages_idx on partner_messages(owner_id, opportunity_id, created_at)`,
  `create table if not exists acquisition_runs (
     id text primary key,
     owner_id text not null,
     started_at text not null,
     completed_at text not null,
     status text not null,
     detail text not null,
     observed integer not null,
     kept integer not null,
     rejected integer not null,
     duplicates integer not null,
     created integer not null,
     source_runs text not null
   )`,
  `create index if not exists acquisition_runs_owner_idx on acquisition_runs(owner_id, completed_at)`,
  // Keyed by owner as well as provider. A provider's health is a fact about one
  // person's capture attempt, not a global property of the provider.
  `create table if not exists source_health (
     owner_id text not null,
     provider_id text not null,
     available integer not null,
     detail text not null,
     checked_at text not null,
     primary key (owner_id, provider_id)
   )`,
  // The operator's service profile. One row per owner. Capabilities, keywords,
  // and negative signals are stored as JSON arrays. Null means the operator has
  // not completed onboarding yet — the app redirects until this row exists.
  `create table if not exists service_profiles (
     id text not null,
     owner_id text not null primary key,
     name text not null,
     description text not null,
     capabilities text not null,
     keywords text not null,
     negative_signals text not null,
     locations text not null,
     minimum_engagement text,
     created_at text not null,
     updated_at text not null
   )`,
];

async function columnExists(driver: SqlDriver, table: string, column: string): Promise<boolean> {
  if (driver.kind === "postgres") {
    const rows = await driver.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = ? and column_name = ?",
      [table, column],
    );
    return rows.length > 0;
  }
  const rows = await driver.query<{ name: string }>("select name from pragma_table_info(?)", [table]);
  return rows.some((row) => row.name === column);
}

async function tableExists(driver: SqlDriver, table: string): Promise<boolean> {
  if (driver.kind === "postgres") {
    const rows = await driver.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_name = ?",
      [table],
    );
    return rows.length > 0;
  }
  const rows = await driver.query<{ name: string }>(
    "select name from sqlite_master where type = 'table' and name = ?",
    [table],
  );
  return rows.length > 0;
}

/**
 * Clears out the single-tenant tables this app used before leads belonged to
 * anyone.
 *
 * Every table used to be global — one shared corpus, with no column recording
 * whose it was. Those rows cannot be carried forward: there is nothing on them
 * to say who they belong to, and handing one person's captured leads to whoever
 * signs in next is exactly the problem this change exists to fix. So the old
 * tables are dropped once, and `MIGRATIONS` builds the owned schema in their
 * place.
 *
 * Guarded on `owner_id` being *absent*: a database that has already been through
 * this is skipped, and a brand-new one never reaches it. It runs at most once
 * per database, on the first request after deploying the change.
 */
async function dropPreOwnershipTables(driver: SqlDriver): Promise<void> {
  if (!(await tableExists(driver, "opportunities"))) return;
  if (await columnExists(driver, "opportunities", "owner_id")) return;
  for (const table of TABLES) {
    await driver.exec(`drop table if exists ${table}`);
  }
}

/** Adds a column only when it is missing, so migrations stay idempotent. */
async function addColumnIfMissing(
  driver: SqlDriver,
  table: string,
  column: string,
  type: string,
): Promise<void> {
  if (await columnExists(driver, table, column)) return;
  await driver.exec(`alter table ${table} add column ${column} ${type}`);
}

export async function migrate(driver: SqlDriver): Promise<void> {
  await dropPreOwnershipTables(driver);
  for (const statement of MIGRATIONS) {
    await driver.exec(statement);
  }
  await addColumnIfMissing(driver, "partner_messages", "payload", "text");
}
