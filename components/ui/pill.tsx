import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

type PillTone = "neutral" | "brand" | "accent" | "up" | "down" | "outline";

const TONE: Record<PillTone, string> = {
  neutral: "bg-surface-3 text-fg-soft",
  brand: "bg-brand-soft text-brand",
  accent: "bg-accent/10 text-accent",
  up: "bg-up-bg text-up",
  down: "bg-down-bg text-down",
  outline: "border border-line text-fg-soft",
};

export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        // A chip is one line by definition: wrapping "Strong match" onto two
        // lines turns a label into a paragraph and breaks the row rhythm.
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-5",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The reference's change chip: a direction arrow with a percentage, green when
 * things moved up and red when they moved down.
 */
export function DeltaPill({ value, className }: { value: number | null; className?: string }) {
  if (value === null) {
    return (
      <Pill tone="neutral" className={className}>
        <Minus aria-hidden="true" className="size-3" />
        <span title="No earlier period to compare with yet">n/a</span>
      </Pill>
    );
  }
  const flat = value === 0;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Pill tone={flat ? "neutral" : value > 0 ? "up" : "down"} className={className}>
      <Icon aria-hidden="true" className="size-3" />
      {flat ? "0%" : `${value > 0 ? "+" : ""}${value}%`}
    </Pill>
  );
}

/** A round status dot with a label, used in legends and source rows. */
export function Dot({
  color,
  className,
}: {
  color: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", className)}
      style={{ background: color }}
    />
  );
}
