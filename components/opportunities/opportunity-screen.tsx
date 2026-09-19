import Link from "next/link";

import { OpportunityViews } from "@/components/opportunities/opportunity-views";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { count } from "@/lib/plain";
import { requirePageUser } from "@/lib/api-auth";
import { listOpportunities } from "@/lib/data/repository";
import { VIEWS, viewBySlug } from "@/lib/views";
import { periodWindow, resolveRange, type RangeRequest } from "@/lib/window";

/**
 * One screen, four routes.
 *
 * `/opportunities` and its three saved views are the same page with a different
 * predicate, so they share this body. Writing it four times would mean four
 * places to update the columns, the copy and the empty state — and the views
 * would drift apart in exactly the way `lib/views.ts` exists to prevent.
 *
 * The period picker in the topbar is on every page, so it has to mean something
 * on every page: the list honours the same window the Overview does, measured
 * the same way. A control that silently does nothing on eight routes out of nine
 * is worse than no control.
 *
 * The view is resolved from a slug rather than passed as an object because
 * `View` carries a `match` function, which cannot cross into the client
 * component that draws the table.
 */
export async function OpportunityScreen({ slug, range, from, to }: { slug: string } & RangeRequest) {
  const view = viewBySlug(slug) ?? VIEWS[0];
  const all = await listOpportunities(await requirePageUser());

  const now = new Date();
  const earliest = all.length
    ? new Date(Math.min(...all.map((item) => new Date(item.publishedAt).getTime())))
    : now;
  // `from` and `to` have to be forwarded, not just `range`: dropping them makes a
  // custom range silently resolve to the default preset, so the picker and the
  // list disagree about which period is on screen.
  const resolved = resolveRange({ range, from, to }, earliest, now);
  const windowed = periodWindow(all, (item) => item.publishedAt, resolved).current;

  const items = windowed.filter(view.match);

  // Two different nothings, and they need different words: nothing matches this
  // view at all, or things match but none were written in this period.
  const matchingAll = all.filter(view.match).length;
  const hiddenByPeriod = items.length === 0 && matchingAll > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{view.label}</h2>
          <p className="mt-1 text-[13px] text-fg-muted">{view.blurb}</p>
        </div>
        <p className="text-[12px] text-fg-muted">
          {/* Compared against this view's own total, not the whole corpus: "6 of
              6" is noise, and only the period actually hiding something is worth
              saying. Comparing against `all` would report the period as lossy on
              a route where the view filter, not the period, is doing the work. */}
          {items.length === matchingAll
            ? `${count(items.length)} found`
            : `${count(items.length)} of ${count(matchingAll)} found`}{" "}
          · {resolved.label}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            // The heading above already names the view, so this repeats nothing:
            // it says only what the period did. Interpolating the label produced
            // "Nothing new in done", which is not a sentence.
            title={hiddenByPeriod ? "Nothing posted in this period" : "Nothing here yet"}
            body={
              hiddenByPeriod
                ? "Some opportunities match this view, but none were posted in this period. Try a longer period, or see all time."
                : view.empty
            }
            action={
              hiddenByPeriod ? (
                // Keeps the view you were on: widening the period should not
                // also throw away which list you were reading.
                <Link
                  href={`${view.path}?range=all`}
                  className="inline-flex h-8 items-center rounded-full bg-brand px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-brand-bright"
                >
                  See all time
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <OpportunityViews
          items={items}
          sheetTitle={view.label}
          emptyTable={<p className="py-8 text-center text-[13px] text-fg-muted">{view.empty}</p>}
          emptySheet={<p className="py-8 text-center text-[13px] text-fg-muted">{view.empty}</p>}
        />
      )}
    </div>
  );
}
