import type { OpportunityListItem } from "@/lib/data/repository";

/**
 * The saved views over the opportunity list, and the predicates behind them.
 *
 * These lived in `app/page.tsx` and had to be shared: the Overview funnel, the
 * `/opportunities` table and the three filtered nav routes all have to agree on
 * what "worth pursuing" means, or the same opportunity appears in one place and
 * vanishes from another.
 */

/** Good enough to spend time on: either already moving, or checked and it fits. */
export const isWorthPursuing = (item: OpportunityListItem) =>
  ["QUALIFIED", "ACTIVE", "WON"].includes(item.status);

/** Open and being worked: you have reached out and nobody has closed it out. */
export const isInProgress = (item: OpportunityListItem) => item.status === "ACTIVE";

/** Closed, either way. Won and lost are both finished. */
export const isDone = (item: OpportunityListItem) => item.status === "WON" || item.status === "LOST";

/** Somebody wrote back. */
export const isReplied = (item: OpportunityListItem) =>
  ["REPLIED", "CONVERSATION", "MEETING", "PROPOSAL", "WON"].includes(item.outcome ?? "");

export type ViewSlug = "all" | "worth-pursuing" | "in-progress" | "done";

/**
 * The funnel's stages, in order.
 *
 * It has to be a genuine progression — each stage a subset of the one before —
 * or the bars stop being a funnel. Reading the stages off independent
 * predicates produced a chart where "Reached out" was taller than "Worth
 * pursuing", because a deal can be lost without ever having been marked worth
 * pursuing. A funnel that goes up tells the reader nothing.
 *
 * The stages are **milestones reached**, and their labels are worded as such.
 * Stage 1 in particular is deliberately *not* "Worth pursuing": that is a
 * current status (see `isWorthPursuing`, and the tile of the same name), so a
 * funnel stage carrying the same words shows a different number two inches from
 * the tile — it counts everything that ever got that far, including deals since
 * lost. "Fit check" says what the stage measures, in the same words the
 * opportunity table's Fit column and the tile notes already use, and leaves
 * "worth pursuing" to mean one thing.
 *
 * Short on purpose as well as plain: five of these share the width of a card,
 * and a longer phrase truncates.
 */
export const FUNNEL_STAGES = ["Found", "Fit check", "Reached out", "Replied", "Won"] as const;

/**
 * How far an opportunity actually got, as an index into `FUNNEL_STAGES`.
 *
 * Returns the *furthest* point reached, so the funnel can count `>= stage` and
 * stay monotonic by construction: winning implies having replied, replied
 * implies having reached out, and reaching out implies it was worth pursuing —
 * even when the status field never recorded the intermediate step.
 */
export function furthestStage(item: OpportunityListItem): number {
  if (item.outcome === "WON") return 4;
  if (isReplied(item)) return 3;
  if (isInProgress(item) || item.status === "LOST") return 2;
  if (item.status === "QUALIFIED") return 1;
  return 0;
}

/** Item counts for each funnel stage, guaranteed non-increasing. */
export function funnelCounts(items: OpportunityListItem[]): number[] {
  const stages = items.map(furthestStage);
  return FUNNEL_STAGES.map((_, index) => stages.filter((stage) => stage >= index).length);
}
export interface View {
  slug: ViewSlug;
  /** Path under `/opportunities`. */
  path: string;
  label: string;
  /** Shown above the table, in plain language. */
  blurb: string;
  /** What an empty view should tell the person to do. */
  empty: string;
  match: (item: OpportunityListItem) => boolean;
}

/**
 * Note that "In progress" is `status === "ACTIVE"` and nothing else. The older
 * predicate included `LOST`, which meant the nav item labelled "In progress"
 * listed dead deals alongside live ones.
 *
 * "Done" is the mirror image and owns both closed states.
 */
export const VIEWS: View[] = [
  {
    slug: "all",
    path: "/opportunities",
    label: "All opportunities",
    blurb: "Everything found so far, best first.",
    empty: "Nothing found yet. Run a search and this fills up.",
    match: () => true,
  },
  {
    slug: "worth-pursuing",
    path: "/opportunities/worth-pursuing",
    label: "Worth pursuing",
    blurb: "Checked against what you sell, and worth a reply.",
    empty: "Nothing has cleared the fit check yet. Check your Settings describe what you sell.",
    match: isWorthPursuing,
  },
  {
    slug: "in-progress",
    path: "/opportunities/in-progress",
    label: "In progress",
    blurb: "You reached out and the conversation is still open.",
    empty: "You have not reached out to anyone yet. Open an opportunity and log the first contact.",
    match: isInProgress,
  },
  {
    slug: "done",
    path: "/opportunities/done",
    label: "Done",
    blurb: "Closed out, won or lost, with the outcome recorded.",
    empty: "Nothing is closed out yet. Outcomes you record land here.",
    match: isDone,
  },
];

const BY_SLUG = new Map(VIEWS.map((view) => [view.slug, view]));

export function viewBySlug(slug: string): View | undefined {
  return BY_SLUG.get(slug as ViewSlug);
}

/** The view a pathname belongs to, for the shared `/opportunities` table. */
export function viewByPath(pathname: string): View {
  return VIEWS.find((view) => view.path === pathname) ?? VIEWS[0];
}
