"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import type { GroupOption } from "@/lib/groups";

/**
 * The reference's country pills, over ArkZen's groupings.
 *
 * The selection lives in the URL rather than in component state, for the same
 * reason the period picker does: a link to "what r/devops is producing" should
 * open on r/devops. It also keeps the panel a server component, so the figures
 * are rendered from real data on the server rather than fetched in the browser.
 *
 * `router.replace`, not `push` — picking through six pills should not put six
 * entries in the back button, any more than flicking through a table's sort
 * order does. `scroll: false` because the pills are the control you are
 * operating; jumping to the top on every click would move the thing you clicked.
 */

/**
 * The two groupings, as links rather than tabs.
 *
 * They are separate routes in the nav, so the control is navigation and reads
 * as such — the range carries across, because "the last 30 days" is a fact
 * about your search, not about which screen you are on.
 */
const SIBLINGS = [
  { href: "/sources", label: "Sources" },
  { href: "/categories", label: "Categories" },
];

export function GroupPicker({
  groups,
  selected,
  param = "show",
}: {
  /** Only the drawable fields — `Group`'s `match` cannot cross this boundary. */
  groups: GroupOption[];
  /** The key currently being reported on. */
  selected: string | null;
  /** The query key holding the selection. */
  param?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function pick(key: string) {
    const next = new URLSearchParams(searchParams);
    next.set(param, key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  /** The current range, carried onto the sibling grouping. */
  const carried = new URLSearchParams(searchParams);
  carried.delete(param);
  const suffix = carried.toString();

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
        {SIBLINGS.map((sibling) => (
          <Link
            key={sibling.href}
            href={suffix ? `${sibling.href}?${suffix}` : sibling.href}
            aria-current={pathname === sibling.href ? "page" : undefined}
            className={cn(
              "rounded-full px-3 py-1 text-[13px] font-medium transition-colors",
              pathname === sibling.href
                ? "bg-surface text-fg shadow-card"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {sibling.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Which one to show">
        {groups.map((group) => {
          const active = group.key === selected;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => pick(group.key)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                active
                  ? "border-transparent bg-hero text-hero-fg"
                  : "border-line bg-surface text-fg-soft hover:bg-surface-2 hover:text-fg",
              )}
            >
              {group.label}
              <span className={cn("ml-1.5 tabular-nums", active ? "text-hero-muted" : "text-fg-muted")}>
                {group.total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
