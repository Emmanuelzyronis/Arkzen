"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, Zap } from "lucide-react";

import { PeriodPicker } from "@/components/shell/period-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import { routeMeta } from "@/lib/nav";

function PeriodPickerFallback() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 items-center justify-between gap-2 rounded-md border border-line bg-surface px-2.5 text-[12px] font-medium text-fg"
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
    <header className="z-30 flex shrink-0 items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-0 sm:px-5" style={{ height: "52px" }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg lg:hidden"
        >
          <Menu aria-hidden="true" className="size-[18px]" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.02em] text-fg">{title}</h1>
          {subtitle ? (
            <p className="hidden line-clamp-1 text-[11px] text-fg-muted sm:block">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!["/settings", "/onboarding"].includes(pathname) && (
          <Suspense fallback={<PeriodPickerFallback />}>
            <PeriodPicker />
          </Suspense>
        )}

        <Link
          href="/settings"
          title="What you're looking for"
          className="hidden h-7 max-w-[180px] items-center gap-1.5 truncate rounded-md border border-line bg-surface-2 px-2.5 text-[12px] font-medium text-fg-soft transition-colors hover:bg-surface-3 sm:inline-flex"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-brand" />
          <span className="truncate">{profileName}</span>
        </Link>

        <Link
          href="/opportunities"
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          <Zap aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="hidden sm:inline">Find leads</span>
        </Link>

        <ThemeToggle />
      </div>
    </header>
  );
}
