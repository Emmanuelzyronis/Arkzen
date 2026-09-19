"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "@/components/shell/sign-out-button";
import { Tooltip } from "@/components/ui/tooltip";
import { FOOTER_NAV, NAV_GROUPS, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavRow({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(item, pathname);
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-2.5 rounded-full px-3 text-[13px] transition-colors",
        collapsed && "justify-center px-0",
        active ? "bg-surface-3 font-medium text-fg" : "text-fg-soft hover:bg-surface-3 hover:text-fg",
      )}
    >
      <item.icon
        aria-hidden="true"
        className={cn("size-[17px] shrink-0", active ? "text-brand" : "text-fg-muted group-hover:text-fg-soft")}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  return collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link;
}

/**
 * The nav itself, shared by the desktop rail and the mobile drawer so the two
 * can never drift apart. `footer` is a slot for the rail's collapse control,
 * which the drawer has no use for.
 */
export function SidebarNav({
  collapsed = false,
  onNavigate,
  footer,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={cn(groupIndex > 0 && "mt-5")}>
            {group.label && !collapsed && (
              <p className="px-3 pb-1.5 text-[11px] font-medium text-fg-muted">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <div className="space-y-0.5">
          {FOOTER_NAV.map((item) => (
            <NavRow
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
        {/* Set apart from the destinations above it: this is the one row here
            that leaves the app rather than moving within it. */}
        <div className="mt-1 border-t border-line pt-1">
          <SignOutButton collapsed={collapsed} />
        </div>
        {footer}
      </div>
    </>
  );
}
