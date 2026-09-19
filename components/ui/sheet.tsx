"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A panel that slides in over the page — the reference's calendar sheet.
 *
 * Built on Radix so focus trapping, ESC-to-close, scroll locking and the
 * `aria-modal` wiring come for free rather than being re-implemented slightly
 * wrong. It anchors to the bottom on a phone and floats top-right on a desktop,
 * which is where the control that opens it lives.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Read out after the title; also the visible explanatory line. */
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="animate-fade fixed inset-0 z-40 bg-black/45" />
        <DialogPrimitive.Content
          className={cn(
            "animate-fade fixed z-50 flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden border border-line bg-surface shadow-panel",
            // Bottom sheet on narrow screens, floating card under the picker on wide ones.
            "inset-x-3 bottom-3 rounded-panel",
            "sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-16 sm:w-[340px] sm:rounded-card",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-[13px] font-semibold text-fg">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="-mr-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <X aria-hidden="true" className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

          {footer ? (
            <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
