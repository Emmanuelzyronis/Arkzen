"use client";

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Ends the session and returns to the sign-in screen.
 *
 * It lives in `SidebarNav`'s footer rather than the topbar so the same control
 * serves both the desktop rail and the mobile drawer — those two render the same
 * `SidebarNav` precisely so they cannot drift, and putting sign-out anywhere else
 * would mean building it twice.
 *
 * `signOut` sends the browser to `/sign-in` itself. That matters: the moment the
 * session ends, every route behind Clerk's gate would otherwise re-render in its
 * signed-out state for a beat before anything navigated away. The redirect is
 * part of the sign-out call so there is no such frame.
 *
 * `pending` is not decoration. Clerk's sign-out is a network round trip, and
 * without it a second click mid-flight fires a second request — the button stays
 * disabled and says what it is doing until the redirect lands.
 */
export function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  const { signOut } = useClerk();
  const [pending, setPending] = useState(false);

  const button = (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        // No `.catch` back to `pending: false` on failure — if signing out fails
        // the session is still live, and re-enabling the button is what lets the
        // person try again. The promise rejects only on a network/Clerk error,
        // and Clerk surfaces those itself.
        void signOut({ redirectUrl: "/sign-in" }).catch(() => setPending(false));
      }}
      className={cn(
        "group flex h-9 w-full items-center gap-2.5 rounded-full px-3 text-[13px] text-fg-soft transition-colors hover:bg-surface-3 hover:text-fg disabled:pointer-events-none disabled:opacity-45",
        collapsed && "justify-center px-0",
      )}
    >
      <LogOut
        aria-hidden="true"
        className="size-[17px] shrink-0 text-fg-muted group-hover:text-fg-soft"
      />
      {!collapsed && <span className="truncate">{pending ? "Signing out…" : "Sign out"}</span>}
    </button>
  );

  return collapsed ? <Tooltip label="Sign out">{button}</Tooltip> : button;
}
