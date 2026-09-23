import {
  CheckCircle2,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Clock,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match the pathname exactly (for "/"), otherwise prefix-match. */
  exact?: boolean;
  /** Plain-language line shown when the item is the page title. */
  subtitle?: string;
}

export const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      {
        href: "/",
        label: "Overview",
        icon: LayoutDashboard,
        exact: true,
        subtitle: "Your lead pipeline at a glance — what's come in and what needs action.",
      },
      {
        href: "/assistant",
        label: "Assistant",
        icon: Sparkles,
        subtitle: "Chat with your pipeline — ask anything, get answers grounded in your real leads.",
      },
    ],
  },
  {
    label: "Opportunities",
    items: [
      {
        href: "/opportunities",
        label: "All",
        icon: FolderOpen,
        subtitle: "Everything found so far, newest and best first.",
      },
      {
        href: "/opportunities/worth-pursuing",
        label: "Worth pursuing",
        icon: Target,
        subtitle: "The ones that look like a real fit for what you sell.",
      },
      {
        href: "/opportunities/in-progress",
        label: "In progress",
        icon: Clock,
        subtitle: "You have reached out and the conversation is open.",
      },
      {
        href: "/opportunities/done",
        label: "Done",
        icon: CheckCircle2,
        subtitle: "Closed out, with the outcome recorded.",
      },
    ],
  },
  {
    label: "Where they come from",
    items: [
      { href: "/sources", label: "Sources", icon: Globe, subtitle: "Which places are sending the best leads right now." },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    subtitle: "The profile behind every score, and how the app looks.",
  },
];

const ALL_ITEMS = [...NAV_GROUPS.flatMap((group) => group.items), ...FOOTER_NAV];

export function routeMeta(pathname: string): { title: string; subtitle: string } {
  const match = ALL_ITEMS.filter((item) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];

  // A lone id under /opportunities is a detail page. This has to be caught
  // before the prefix scan is believed: `/opportunities/abc` already matches the
  // plain `/opportunities` entry, so testing `!match` would never be true and
  // every detail page would be titled "All". The sub-views (worth-pursuing and
  // friends) carry their own longer href, so they win the match above and fall
  // through to their own label instead.
  const detailId = pathname.startsWith("/opportunities/")
    ? pathname.slice("/opportunities/".length)
    : "";
  if (detailId && !detailId.includes("/") && match?.href === "/opportunities") {
    return { title: "Opportunity", subtitle: "What was said, why it matters, and what to do next." };
  }

  return { title: match?.label ?? "Arkzen", subtitle: match?.subtitle ?? "" };
}
