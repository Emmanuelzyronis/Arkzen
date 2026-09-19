import type { ReactNode } from "react";

/**
 * Table shape and ordering, with no DOM in it.
 *
 * The comparators live here rather than in the component so the ordering rules
 * can be tested directly — sorting is the part that silently goes wrong, and it
 * goes wrong in ways a rendered table hides.
 */

export type SortDirection = "asc" | "desc";

export interface Column<T> {
  key: string;
  /** What the column is called. Terse, because the table is dense. */
  header: string;
  /** Numbers are right-aligned and tabular so they line up down the column. */
  align?: "left" | "right";
  /** The value this column sorts on. `null` means "not recorded". */
  value: (row: T) => string | number | null;
  /** How to draw the cell. Defaults to the value as plain text. */
  render?: (row: T) => ReactNode;
  /** Set false for columns that are decoration, not data. */
  sortable?: boolean;
  /** Longer description for the header, when the label alone is ambiguous. */
  hint?: string;
}

export interface SortState {
  key: string;
  direction: SortDirection;
}

/**
 * Order two values.
 *
 * Missing values always sort last, whichever direction is chosen. They are not
 * "the smallest number" — they are absent, and burying them under a descending
 * sort is the only placement that doesn't imply a figure that isn't there.
 */
export function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

/** Sort rows by one column. Returns a new array; the input is not reordered. */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort: SortState): T[] {
  const column = columns.find((entry) => entry.key === sort.key);
  if (!column) return rows;

  const factor = sort.direction === "asc" ? 1 : -1;
  const missing: T[] = [];
  const present: T[] = [];

  // Partition first, so the missing-last rule survives the direction flip that
  // multiplying by `factor` would otherwise reverse.
  for (const row of rows) {
    if (column.value(row) === null) missing.push(row);
    else present.push(row);
  }

  present.sort((left, right) => factor * compareValues(column.value(left), column.value(right)));
  return [...present, ...missing];
}

/**
 * The direction a click on this header should produce.
 *
 * A fresh column opens descending — on a dashboard the interesting end of almost
 * every column is the top — and clicking the active column flips it.
 */
export function nextDirection(current: SortState, key: string): SortDirection {
  if (current.key !== key) return "desc";
  return current.direction === "desc" ? "asc" : "desc";
}

/** The default sort: the first sortable column, descending. */
export function defaultSort<T>(columns: Column<T>[]): SortState {
  const first = columns.find((column) => column.sortable !== false);
  return { key: first?.key ?? "", direction: "desc" };
}
