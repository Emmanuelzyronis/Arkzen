import { cn } from "@/lib/utils";

/**
 * ArkZen mark: a rounded tile with a geometric signal/target shape.
 * Flat, single-colour, legible at 28px.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand text-white",
        className,
      )}
    >
      <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" aria-hidden="true">
        {/* Outer arc — top half only, signal/radar motif */}
        <path
          d="M4 10 A6 6 0 0 1 16 10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Inner arc */}
        <path
          d="M6.5 10 A3.5 3.5 0 0 1 13.5 10"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* Centre dot */}
        <circle cx="10" cy="10" r="1.6" fill="currentColor" />
      </svg>
    </span>
  );
}
