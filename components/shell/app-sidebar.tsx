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
        "hidden h-full shrink-0 flex-col overflow-hidden border-r border-line bg-surface transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[64px]" : "w-[232px]",
      )}
    >
      <div className={cn("flex items-center gap-2.5 border-b border-line px-4 py-3", collapsed && "justify-center px-0")}>
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <BrandMark className="size-5 text-brand" />
          {!collapsed && (
            <span className="truncate text-[14px] font-semibold tracking-[-0.02em] text-fg">Arkzen</span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse navigation"
            className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
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
              className="mt-1 grid size-9 w-full place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <ChevronsRight aria-hidden="true" className="size-4" />
            </button>
          ) : null
        }
      />
    </aside>
  );
}
