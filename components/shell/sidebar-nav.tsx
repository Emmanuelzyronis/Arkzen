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
        "group relative flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] transition-colors duration-150",
        collapsed && "justify-center px-0",
        active
          ? "bg-brand-soft font-medium text-brand"
          : "text-fg-soft hover:bg-surface-2 hover:text-fg",
      )}
    >
      {active && !collapsed && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-brand"
        />
      )}
      <item.icon
        aria-hidden="true"
        className={cn(
          "size-[15px] shrink-0",
          active ? "text-brand" : "text-fg-muted group-hover:text-fg-soft",
        )}
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
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-2 pt-3">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? `group-${groupIndex}`} className={cn(groupIndex > 0 && "mt-3")}>
            {group.label && !collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold tracking-widest text-fg-muted uppercase">
                {group.label}
              </p>
            )}
            <div className="space-y-px">
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

      <div className="border-t border-line px-3 pb-3 pt-2">
        <div className="space-y-px">
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
        <div className="mt-1.5 border-t border-line pt-1.5">
          <SignOutButton collapsed={collapsed} />
        </div>
        {footer}
      </div>
    </>
  );
}
