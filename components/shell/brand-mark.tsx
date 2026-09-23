/* Signal-bars mark — three ascending bars, thematic for "capture signal". */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className ?? "size-[18px]"}
      fill="none"
      aria-hidden="true"
    >
      <rect x="2"  y="12" width="3.5" height="6" rx="1" fill="currentColor" opacity="0.45" />
      <rect x="8.25" y="7"  width="3.5" height="11" rx="1" fill="currentColor" opacity="0.72" />
      <rect x="14.5" y="2"  width="3.5" height="16" rx="1" fill="currentColor" />
    </svg>
  );
}
