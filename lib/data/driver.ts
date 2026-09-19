import type { SqlDriver } from "./types";

let cached: Promise<SqlDriver> | null = null;

export function databaseUrl(): string | null {
  return process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? null;
}

export function driverKind(): "postgres" | "sqlite" {
  return databaseUrl() ? "postgres" : "sqlite";
}

/**
 * One async SQL surface, two drivers. Local development and tests run on
 * SQLite; a deployed instance runs on Postgres when DATABASE_URL is present.
 * Nothing above this file knows which one is active.
 */
export async function getDriver(): Promise<SqlDriver> {
  if (!cached) {
    cached = (async () => {
      if (databaseUrl()) {
        const { createPostgresDriver } = await import("./postgres-driver");
        return createPostgresDriver(databaseUrl() as string);
      }
      const { createSqliteDriver } = await import("./sqlite-driver");
      return createSqliteDriver(
        process.env.ARKZEN_SQLITE_PATH ?? "data/arkzen.sqlite3",
      );
    })();
  }
  return cached;
}

export async function resetDriverCache(): Promise<void> {
  if (cached) {
    const driver = await cached;
    await driver.close();
  }
  cached = null;
}
