import { Pool } from "pg";
import type { SqlDriver } from "./types";

/** Translates `?` placeholders to Postgres `$n` without touching string literals. */
export function toPostgresPlaceholders(sql: string): string {
  let index = 0;
  let inString = false;
  let result = "";
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") {
      inString = !inString;
      result += char;
      continue;
    }
    if (char === "?" && !inString) {
      index += 1;
      result += `$${index}`;
      continue;
    }
    result += char;
  }
  return result;
}

export function createPostgresDriver(connectionString: string): SqlDriver {
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const globalScope = globalThis as unknown as { __arkzenPool?: Pool };
  const pool =
    globalScope.__arkzenPool ??
    new Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: isLocal ? undefined : { rejectUnauthorized: false },
    });
  globalScope.__arkzenPool = pool;

  return {
    kind: "postgres",
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const result = await pool.query(toPostgresPlaceholders(sql), params as unknown[]);
      return result.rows as T[];
    },
    async run(sql: string, params: unknown[] = []): Promise<void> {
      await pool.query(toPostgresPlaceholders(sql), params as unknown[]);
    },
    async exec(sql: string): Promise<void> {
      await pool.query(sql);
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
