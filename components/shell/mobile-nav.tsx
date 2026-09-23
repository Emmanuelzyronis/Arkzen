"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import Link from "next/link";
import { X } from "lucide-react";

import { BrandMark } from "@/components/shell/brand-mark";
import { SidebarNav } from "@/components/shell/sidebar-nav";

/**
 * The reference's mobile navigation: the same rail, in a drawer.
 *
 * Below 1024px the desktop aside is `lg:flex`-only and there is nothing behind
 * it, which left the app with no navigation at all on a phone. This fills that
 * gap using the same `SidebarNav` the rail uses, so the two cannot drift.
 *
 * Visibility is handled purely in CSS (`lg:hidden`) rather than by
 * `hooks/use-mobile.tsx`: that hook has no value on the server, so it would
 * render the wrong layout on the first client paint and flash.
 */
export function MobileNav({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 animate-fade bg-black/45 lg:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[248px] max-w-[calc(100vw-3rem)] animate-fade flex-col overflow-hidden border-r border-line bg-surface lg:hidden">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Jump to any part of Arkzen.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <Link
              href="/"
              onClick={() => onOpenChange(false)}
              className="flex min-w-0 items-center gap-2"
            >
              <BrandMark className="size-5 text-brand" />
              <span className="truncate text-[14px] font-semibold tracking-[-0.02em] text-fg">Arkzen</span>
            </Link>
            <DialogPrimitive.Close
              aria-label="Close navigation"
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <X aria-hidden="true" className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <SidebarNav onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
