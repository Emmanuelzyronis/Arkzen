"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { RangeSheet } from "@/components/shell/range-sheet";
import { resolveRange, type RangeRequest } from "@/lib/window";

/**
 * The reference's "Last 7 days" control.
 *
 * It writes the range to the URL, which every page reads, so the label and the
 * numbers underneath it can never disagree. The footprint here is deliberately
 * identical to `PeriodPickerFallback` in the topbar, so nothing shifts when this
 * hydrates in.
 */
export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const current: RangeRequest = {
    range: params.get("range") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };

  // Only the label is needed here, so the fallback window is just "today".
  const label = resolveRange(current, new Date()).label;

  const apply = (next: RangeRequest) => {
    const query = new URLSearchParams(params.toString());
    query.delete("range");
    query.delete("from");
    query.delete("to");

    // The default range stays out of the URL, so a plain link to a page means
    // the default rather than a pinned date the reader didn't choose.
    if (next.range && next.range !== "7") {
      query.set("range", next.range);
      if (next.range === "custom") {
        if (next.from) query.set("from", next.from);
        if (next.to) query.set("to", next.to);
      }
    }

    const search = query.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-7 items-center justify-between gap-2 rounded-md border border-line bg-surface px-2.5 text-[12px] font-medium text-fg transition-colors hover:bg-surface-3"
      >
        {label}
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-fg-muted" />
      </button>
      <RangeSheet open={open} onOpenChange={setOpen} current={current} onApply={apply} />
    </>
  );
}
