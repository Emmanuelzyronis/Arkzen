import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * An empty screen is an invitation to act, not a mood.
 *
 * So this always takes a title that says what would be here, a body that says
 * how to get it, and — wherever there is one — the action that starts it. No
 * illustration, no apology.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid place-items-center px-6 py-12 text-center", className)}>
      <div className="max-w-sm">
        {Icon ? (
          <span
            aria-hidden="true"
            className="mx-auto grid size-11 place-items-center rounded-full bg-surface-3 text-fg-muted"
          >
            <Icon className="size-5" />
          </span>
        ) : null}
        <p className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{body}</p>
        {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
