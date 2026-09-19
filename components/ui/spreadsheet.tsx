"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Download, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SheetColumn<T> {
  key: string;
  /** Friendly name. The A/B/C letter is derived from position. */
  label: string;
  /** Numbers sit right with tabular figures, as in the reference. */
  align?: "left" | "right";
  /** Plain value, used for the cell text and the CSV export. */
  value: (row: T) => string | number | null;
  /** Optional richer cell body. The CSV still exports `value`. */
  render?: (row: T) => React.ReactNode;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
function columnLetter(index: number): string {
  let value = index;
  let letter = "";
  do {
    letter = String.fromCharCode(65 + (value % 26)) + letter;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return letter;
}

/** Quote a CSV field if it contains anything that would break the row. */
function csvField(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Design3's "Top 10 Products" grid.
 *
 * The A–E column letters and the 1..14 row gutter are reproduced exactly as the
 * reference draws them — the letters are real coordinates and the gutter is a
 * real row number, not decoration, and the grid is always `rowCount` rows tall
 * whether or not there is data in them. That is what makes it read as a
 * spreadsheet rather than a table with two extra columns.
 *
 * The grid draws full cell borders, unlike the ranked table's horizontal rules,
 * because a spreadsheet is read across and down.
 */
export function Spreadsheet<T>({
  columns,
  rows,
  getKey,
  title,
  rowCount = 14,
  empty,
}: {
  columns: SheetColumn<T>[];
  rows: T[];
  getKey: (row: T) => string;
  /** Shown as a filename-safe prefix for the export and as the accessible caption. */
  title: string;
  /** Total rows drawn, including empty ones. The reference's gutter runs 1..14. */
  rowCount?: number;
  empty?: React.ReactNode;
}) {
  const router = useRouter();

  const letters = useMemo(() => columns.map((_, index) => columnLetter(index)), [columns]);

  const download = useCallback(() => {
    const header = columns.map((column) => csvField(column.label)).join(",");
    const body = rows.map((row) => columns.map((column) => csvField(column.value(row))).join(","));
    const csv = [header, ...body].join("\n");

    // A Blob URL keeps this entirely client-side — there is no export endpoint,
    // and inventing one for a file the browser can already build would be worse.
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [columns, rows, title]);

  const drawn = Math.max(rowCount, rows.length);

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      {/* No visible title: every caller of this grid already has a heading
          directly above it, and the panel was printing that same sentence a
          second time. The name survives as the sr-only caption below, which is
          what actually labels the table for assistive tech. */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-line px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={download}
            disabled={rows.length === 0}
            title="Download as a spreadsheet file"
            aria-label="Download as a spreadsheet file"
            className="grid size-7 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg disabled:pointer-events-none disabled:opacity-45"
          >
            <Download aria-hidden="true" className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => router.refresh()}
            title="Refresh from the database"
            aria-label="Refresh from the database"
            className="grid size-7 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse font-mono text-[12px]">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-10 border-b border-r border-line bg-surface-2 py-1.5">
                <span className="sr-only">Row</span>
              </th>
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  // "A" means nothing read aloud, so the letter is the visible text
                  // and the friendly name is the accessible one.
                  aria-label={column.label}
                  className={cn(
                    "border-b border-line bg-surface-2 py-1.5 font-normal text-fg-muted",
                    index < columns.length - 1 && "border-r",
                  )}
                >
                  {letters[index]}
                </th>
              ))}
            </tr>
            <tr>
              <td className="border-b border-r border-line bg-surface-2" />
              {columns.map((column, index) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "border-b border-line px-2.5 py-2 text-left font-sans text-[12px] font-medium text-fg-soft",
                    column.align === "right" && "text-right",
                    index < columns.length - 1 && "border-r",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && empty ? (
              <tr>
                <td colSpan={columns.length + 1} className="border-b border-line">
                  {empty}
                </td>
              </tr>
            ) : (
              Array.from({ length: drawn }, (_, rowIndex) => {
                const row = rows[rowIndex];
                return (
                  <tr key={row ? getKey(row) : `blank-${rowIndex}`} className="h-8">
                    <td className="border-b border-r border-line bg-surface-2 text-center text-[11px] tabular-nums text-fg-muted">
                      {rowIndex + 1}
                    </td>
                    {columns.map((column, columnIndex) => (
                      <td
                        key={column.key}
                        className={cn(
                          "border-b border-line px-2.5 align-middle text-fg",
                          column.align === "right" && "text-right tabular-nums",
                          columnIndex < columns.length - 1 && "border-r",
                        )}
                      >
                        {row ? (column.render ? column.render(row) : column.value(row)) : null}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
