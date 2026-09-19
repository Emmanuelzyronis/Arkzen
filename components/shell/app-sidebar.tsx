"use client";

import Link from "next/link";
import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { BrandMark } from "@/components/shell/brand-mark";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { cn } from "@/lib/utils";

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-3 hidden h-[calc(100dvh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-card transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[72px]" : "w-[248px]",
      )}
    >
      <div className={cn("flex items-center gap-2.5 px-4 pb-2 pt-4", collapsed && "justify-center px-0")}>
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <BrandMark />
          {!collapsed && (
            <span className="truncate text-[15px] font-semibold tracking-[-0.02em] text-fg">Arkzen</span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse navigation"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <ChevronsLeft aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      <SidebarNav
        collapsed={collapsed}
        footer={
          collapsed ? (
            <button
              type="button"
              onClick={onToggle}
              aria-label="Expand navigation"
              className="mt-1 grid size-9 w-full place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <ChevronsRight aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <p className="px-3 pt-3 text-[11px] leading-relaxed text-fg-muted">
              Every opportunity keeps the post it came from.
            </p>
          )
        }
      />
    </aside>
  );
}
