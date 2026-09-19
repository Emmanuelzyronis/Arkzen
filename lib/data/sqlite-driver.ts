import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type { SqlDriver } from "./types";

export function createSqliteDriver(path: string): SqlDriver {
  const file = path === ":memory:" ? path : resolve(path);
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  return {
    kind: "sqlite",
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, params: unknown[] = []): Promise<void> {
      db.prepare(sql).run(...params);
    },
    async exec(sql: string): Promise<void> {
      db.exec(sql);
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
