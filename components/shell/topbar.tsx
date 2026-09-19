"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu } from "lucide-react";

import { PeriodPicker } from "@/components/shell/period-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { routeMeta } from "@/lib/nav";

/**
 * Mirrors `SelectTrigger`'s footprint exactly (same height, padding, radius and
 * chevron) so nothing shifts when the real control hydrates in.
 *
 * `PeriodPicker` reads `useSearchParams()`, which forces a client bailout. This
 * topbar sits above every route — including the statically prerendered
 * `/_not-found` — so the boundary has to live here rather than on a page.
 */
function PeriodPickerFallback() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 items-center justify-between gap-2 rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-fg"
    >
      Last 7 days
      <ChevronDown className="size-3.5 shrink-0 text-fg-muted" />
    </span>
  );
}

export function WorkspaceTopbar({
  profileName,
  onOpenNav,
}: {
  profileName: string;
  onOpenNav: () => void;
}) {
  const pathname = usePathname();
  const { title, subtitle } = routeMeta(pathname);

  return (
    <header className="sticky top-3 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 shadow-card sm:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg lg:hidden"
        >
          <Menu aria-hidden="true" className="size-[18px]" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
          {subtitle ? <p className="mt-0.5 line-clamp-1 text-[13px] text-fg-muted">{subtitle}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Suspense fallback={<PeriodPickerFallback />}>
          <PeriodPicker />
        </Suspense>
        <Link
          href="/settings"
          title="What you're looking for"
          className="hidden h-8 max-w-[210px] items-center gap-1.5 truncate rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-fg transition-colors hover:bg-surface-3 sm:inline-flex"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-brand" />
          <span className="truncate">{profileName}</span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
