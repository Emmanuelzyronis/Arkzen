"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { monthGrid, monthLabel, shiftMonth, WEEKDAYS } from "@/lib/calendar";
import { RANGE_OPTIONS } from "@/lib/plain";
import { cn } from "@/lib/utils";
import { dayValue, parseDay, shortDay, type RangeRequest } from "@/lib/window";

/**
 * The reference's calendar sheet, with the preset list kept as the fast path.
 *
 * A custom range is genuinely wired through to `?range=custom&from=&to=`, which
 * `resolveRange` turns into the same window the presets produce — so there is no
 * control here that looks like it does something and doesn't.
 *
 * Selection is two clicks: the first sets the start, the second the end. Picking
 * a day earlier than the start reverses them rather than refusing, which is what
 * people mean when they do it.
 */
export function RangeSheet({
  open,
  onOpenChange,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The range currently in the URL. */
  current: RangeRequest;
  /** Called with the new range request; the caller writes it to the URL. */
  onApply: (next: RangeRequest) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  // Both start empty and are filled by the effect below. Keeping one code path
  // for "what the sheet should show" means a URL cannot leave the draft in a
  // state the render is not prepared for.
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  // Re-sync on every open. Plain initialisers only run on the first mount, and
  // the dialog stays mounted while closed — so without this, opening the sheet a
  // second time would show the range you last *tried* rather than the one you
  // are on, and the calendar would still be parked on the old month.
  useEffect(() => {
    if (!open) return;

    // Anything unparseable is dropped rather than trusted: `from` reaches here
    // from a URL a person can edit, and the render below assumes a real day.
    const validDay = (value: string | null | undefined) => {
      const parsed = parseDay(value ?? undefined);
      return parsed ? dayValue(parsed) : null;
    };

    const nextFrom = current.range === "custom" ? validDay(current.from) : null;
    const nextTo = current.range === "custom" ? validDay(current.to) : null;
    setFrom(nextFrom);
    setTo(nextTo);

    const anchor = parseDay(nextFrom ?? undefined);
    setCursor(
      anchor
        ? { year: anchor.getFullYear(), month: anchor.getMonth() }
        : { year: today.getFullYear(), month: today.getMonth() },
    );
    // Only `open` is a trigger: `current` and `today` are read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grid = monthGrid(cursor.year, cursor.month);
  const ready = Boolean(from && to);

  const pick = (key: string) => {
    // No start yet, or both ends already set: begin a new range.
    if (!from || (from && to)) {
      setFrom(key);
      setTo(null);
      return;
    }
    if (key < from) {
      setTo(from);
      setFrom(key);
    } else {
      setTo(key);
    }
  };

  const inRange = (key: string) => Boolean(from && to && key >= from && key <= to);

  /** A day key as a person reads it; falls back to the key rather than crashing. */
  const dayLabel = (key: string) => {
    const parsed = parseDay(key);
    return parsed ? shortDay(parsed) : key;
  };

  const applyPreset = (value: string) => {
    onApply({ range: value });
    onOpenChange(false);
  };

  const applyCustom = () => {
    if (!from || !to) return;
    onApply({ range: "custom", from, to });
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Which period?"
      description="Everything on the page follows this choice."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" disabled={!ready} onClick={applyCustom}>
            Use these dates
          </Button>
        </>
      }
    >
      <div className="border-b border-line p-2">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => applyPreset(option.value)}
            aria-current={current.range === option.value || (!current.range && option.value === "7")}
            className={cn(
              "block w-full rounded-tile px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-3",
              (current.range === option.value || (!current.range && option.value === "7")) &&
                "bg-surface-3 font-medium text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="p-3">
        <p className="px-1 pb-2 text-[12px] text-fg-muted">Or choose exact dates</p>

        <div className="flex items-center justify-between pb-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setCursor((value) => shiftMonth(value.year, value.month, -1))}
            className="grid size-7 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <span aria-live="polite" className="text-[13px] font-medium text-fg">
            {monthLabel(cursor.year, cursor.month)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setCursor((value) => shiftMonth(value.year, value.month, 1))}
            className="grid size-7 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-0.5">
          {WEEKDAYS.map((day) => (
            <span key={day} className="py-1 text-center text-[11px] font-medium text-fg-muted">
              {day}
            </span>
          ))}
          {grid.map((cell) => {
            const selected = cell.key === from || cell.key === to;
            const between = inRange(cell.key) && !selected;
            return (
              <button
                key={cell.key}
                type="button"
                onClick={() => pick(cell.key)}
                aria-pressed={selected}
                aria-label={cell.date.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                className={cn(
                  "mx-auto grid size-8 place-items-center rounded-full text-[12px] tabular-nums transition-colors",
                  // Days borrowed from the neighbouring months stay visible but
                  // recede, so the grid never looks broken at the edges.
                  cell.inMonth ? "text-fg" : "text-fg-muted/60",
                  // The days between the two ends are tinted, not just the ends
                  // themselves — two loose dots don't read as a span.
                  between && "bg-brand-soft text-brand",
                  selected && "bg-brand font-medium text-white",
                  !selected && !between && "hover:bg-surface-3",
                )}
              >
                {cell.date.getDate()}
              </button>
            );
          })}
        </div>

        <p className="px-1 pt-2 text-[12px] text-fg-muted">
          {!from
            ? "Pick the first day."
            : !to
              ? "Now pick the last day."
              : `${dayLabel(from)} to ${dayLabel(to)}`}
        </p>
      </div>
    </Sheet>
  );
}
