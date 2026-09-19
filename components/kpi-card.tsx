import { DeltaPill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The reference's stat tile: small label, change chip on the right, one large
 * figure, and a plain sentence underneath saying what moved.
 */
export function KpiCard({
  label,
  value,
  delta,
  note,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  note: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("px-5 py-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] text-fg-soft">{label}</span>
        {delta === undefined ? null : <DeltaPill value={delta} />}
      </div>
      <div className="mt-3 text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-fg">
        {value}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{note}</p>
    </Card>
  );
}
