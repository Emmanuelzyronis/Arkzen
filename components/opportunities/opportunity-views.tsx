"use client";

import { useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";

import { FindLeads } from "@/components/opportunities/find-leads";
import { Meter, DataTable } from "@/components/ui/data-table";
import { Spreadsheet } from "@/components/ui/spreadsheet";
import { Pill } from "@/components/ui/pill";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/segmented";
import { bandLabel, outcomeLabel, statusLabel } from "@/lib/plain";
import { categoryLabel } from "@/lib/domain/category";
import { needAddsDetail } from "@/lib/domain/summary";
import { humanizeAge } from "@/lib/domain/text";
import type { OpportunityListItem } from "@/lib/data/repository";
import type { Column } from "@/lib/table";
import type { SheetColumn } from "@/components/ui/spreadsheet";

/**
 * The opportunity list, in the reference's two shapes.
 *
 * Design.png's Markets table and Design3's Top 10 spreadsheet show the same
 * rows two ways, so both column sets are defined here, next to each other. Split
 * across two files they would drift — a column renamed in one and not the other
 * is the kind of thing nobody notices until the numbers disagree.
 */

const category = (item: OpportunityListItem) => categoryLabel(item.category);

const TABLE_COLUMNS: Column<OpportunityListItem>[] = [
  {
    key: "title",
    header: "Opportunity",
    value: (item) => item.title,
    render: (item) => (
      <span className="block max-w-[340px]">
        <span className="line-clamp-2 font-medium leading-snug text-fg">{item.title}</span>
        <span className="mt-0.5 block truncate text-[12px] text-fg-muted">
          {needAddsDetail(item.title, item.needSummary) ? item.needSummary : category(item)}
        </span>
      </span>
    ),
  },
  { key: "source", header: "Source", value: (item) => item.sourceName },
  {
    key: "score",
    header: "Score",
    align: "right",
    hint: "How well this matches what you sell, out of 100.",
    value: (item) => item.score,
    render: (item) => (
      // The table's one bar column, matching the reference's single "Total %"
      // bar: the ranking is what a scanned row needs a sense of, and everything
      // else is better served by a precise figure.
      <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
        <span className="w-14 shrink-0">
          <Meter value={item.score} max={100} />
        </span>
        <span className="tabular-nums">{item.score}</span>
        {/* Tone follows the band rather than a second score threshold, so the
            chip can never contradict the words inside it. */}
        <Pill tone={item.band === "High" || item.band === "Strong" ? "brand" : "neutral"}>
          {bandLabel(item.band)}
        </Pill>
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    value: (item) => statusLabel(item.status),
    render: (item) => {
      const status = statusLabel(item.status);
      const outcome = item.outcome ? outcomeLabel(item.outcome) : null;
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span>{status}</span>
          {/* Only when it adds something. A won deal records status "Won" and
              outcome "Won", and "Won · Won" reads like a rendering fault. */}
          {outcome && outcome !== status ? (
            <span className="text-[12px] text-fg-muted">· {outcome}</span>
          ) : null}
        </span>
      );
    },
  },
  {
    key: "published",
    header: "Posted",
    align: "right",
    hint: "How long ago this was written.",
    value: (item) => item.publishedAt,
    render: (item) => <span className="text-fg-muted">{humanizeAge(item.publishedAt)}</span>,
  },
];

/** Design3's A–E grid: the same rows, five columns, no scrolling sideways. */
const SHEET_COLUMNS: SheetColumn<OpportunityListItem>[] = [
  {
    key: "title",
    label: "Opportunity",
    value: (item) => item.title,
  },
  { key: "source", label: "Source", value: (item) => item.sourceName },
  { key: "score", label: "Score", align: "right", value: (item) => item.score },
  { key: "status", label: "Status", value: (item) => statusLabel(item.status) },
  {
    key: "published",
    label: "Posted",
    align: "right",
    value: (item) => humanizeAge(item.publishedAt),
  },
];

export function OpportunityViews({
  items,
  sheetTitle,
  emptyTable,
  emptySheet,
}: {
  items: OpportunityListItem[];
  /** Becomes the export filename and the grid's accessible caption. */
  sheetTitle: string;
  emptyTable: React.ReactNode;
  emptySheet: React.ReactNode;
}) {
  // Local rather than in the URL: switching shape is a way of reading the same
  // rows, not a different set of them, and a round trip would lose scroll
  // position for no gain.
  const [mode, setMode] = useState<"table" | "grid">("table");

  return (
    <Tabs value={mode} onValueChange={(value) => setMode(value as "table" | "grid")} className="space-y-3">
      {/* The row count used to sit at the right of this row, and the header
          directly above it already says "6 of 11 found · Sep 9 – Sep 10". Two
          copies of the same number 40px apart is not density, it is noise — and
          the header's version is strictly better because it carries the period. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="How to show the opportunities">
          <TabsTrigger value="table">
            <span className="inline-flex items-center gap-1.5">
              <Table2 aria-hidden="true" className="size-3.5" />
              Table
            </span>
          </TabsTrigger>
          <TabsTrigger value="grid">
            <span className="inline-flex items-center gap-1.5">
              <LayoutGrid aria-hidden="true" className="size-3.5" />
              Grid
            </span>
          </TabsTrigger>
        </TabsList>
        {/* Kept to the table view. The grid is the reference's read-only
            spreadsheet, and a control that writes does not belong in it. */}
        {mode === "table" ? <FindLeads /> : null}
      </div>

      {mode === "table" ? (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <DataTable
            rows={items}
            columns={TABLE_COLUMNS}
            getKey={(item) => item.id}
            getHref={(item) => `/opportunities/${item.id}`}
            initialSort={{ key: "score", direction: "desc" }}
            caption="Opportunities, best match first"
            empty={emptyTable}
          />
        </div>
      ) : (
        <Spreadsheet
          columns={SHEET_COLUMNS}
          rows={items}
          getKey={(item) => item.id}
          title={sheetTitle}
          rowCount={14}
          empty={emptySheet}
        />
      )}
    </Tabs>
  );
}
