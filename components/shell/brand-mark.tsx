import { cn } from "@/lib/utils";

/**
 * The Arkzen mark: a solid rounded tile with an aperture ring. Flat shapes
 * only, one colour, legible at 28px.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] bg-brand text-white", className)}
    >
      <svg viewBox="0 0 20 20" className="size-4" fill="none">
        <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}
