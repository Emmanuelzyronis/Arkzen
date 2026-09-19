"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { defaultSort, nextDirection, sortRows, type Column, type SortState } from "@/lib/table";

/** An inline share bar, so a column of percentages is readable at a glance. */
export function Meter({ value, max, color = "var(--brand)" }: { value: number; max: number; color?: string }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span aria-hidden="true" className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
      <span className="block h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </span>
  );
}

/**
 * The reference's ranked table.
 *
 * Sorting is client-side because the whole list is already in the payload —
 * there is nothing to refetch, and a round trip per column click would be
 * slower and would lose the scroll position.
 *
 * Rows are clickable, but the click is a convenience layered on top of a real
 * link in the first cell: that keeps middle-click, cmd-click and keyboard
 * navigation working, which a `onClick` handler on a `<tr>` alone would break.
 */
export function DataTable<T>({
  rows,
  columns,
  getKey,
  getHref,
  initialSort,
  rank = true,
  caption,
  empty,
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  getHref?: (row: T) => string;
  initialSort?: SortState;
  /** Show the 1..n position column, as the reference's ranked tables do. */
  rank?: boolean;
  /** Describes the table for screen readers. */
  caption?: string;
  empty?: React.ReactNode;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState>(() => initialSort ?? defaultSort(columns));

  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  const onHeaderClick = (column: Column<T>) => {
    if (column.sortable === false) return;
    setSort((current) => ({ key: column.key, direction: nextDirection(current, column.key) }));
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-[13px]">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-line text-left">
            {rank ? (
              <th scope="col" className="w-10 px-5 py-2.5">
                <span className="sr-only">Rank</span>
              </th>
            ) : null}
            {columns.map((column) => {
              const active = sort.key === column.key;
              const sortable = column.sortable !== false;
              const Icon = !active ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  className={cn(
                    "px-3 py-2.5 text-[12px] font-medium text-fg-muted first:pl-5 last:pr-5",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onHeaderClick(column)}
                      title={column.hint}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full transition-colors hover:text-fg",
                        column.align === "right" && "flex-row-reverse",
                        active && "text-fg",
                      )}
                    >
                      {column.header}
                      <Icon
                        aria-hidden="true"
                        className={cn("size-3 shrink-0", active ? "opacity-100" : "opacity-45")}
                      />
                    </button>
                  ) : (
                    <span title={column.hint}>{column.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (rank ? 1 : 0)} className="px-5 py-2">
                {empty}
              </td>
            </tr>
          ) : (
            sorted.map((row, index) => {
              const href = getHref?.(row);
              return (
                <tr
                  key={getKey(row)}
                  onClick={href ? () => router.push(href) : undefined}
                  className={cn(
                    "border-b border-line last:border-b-0",
                    href && "cursor-pointer transition-colors hover:bg-surface-2",
                  )}
                >
                  {rank ? (
                    <td className="px-5 py-3 text-[12px] tabular-nums text-fg-muted">{index + 1}</td>
                  ) : null}
                  {columns.map((column, columnIndex) => {
                    const content = column.render ? column.render(row) : column.value(row);
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          "px-3 py-3 align-middle text-fg first:pl-5 last:pr-5",
                          column.align === "right" && "text-right tabular-nums",
                        )}
                      >
                        {/* The first cell carries the real link so keyboard and
                            modifier-click still work when the row itself is clickable. */}
                        {columnIndex === 0 && href ? (
                          <a
                            href={href}
                            className="rounded-sm font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {content}
                          </a>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
