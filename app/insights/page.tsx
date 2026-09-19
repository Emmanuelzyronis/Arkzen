import { BarChart, FunnelChart, Gauge } from "@/components/charts/charts";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { requirePageUser } from "@/lib/api-auth";
import { humanizeAge } from "@/lib/domain/text";
import {
  listAcquisitionRuns,
  listOpportunities,
  listSourceHealth,
} from "@/lib/data/repository";
import { bandCounts, funnel, insightStats, summariseRun } from "@/lib/insights";
import { worthCount } from "@/lib/metrics";
import { count, percent, sourceLabel } from "@/lib/plain";
import { periodWindow, resolveRange } from "@/lib/window";

export const dynamic = "force-dynamic";

/**
 * Insights — the reference's "General metrics" screen.
 *
 * This is the report, and the other screens are not. `/` is an attention view
 * ("what needs me today"), `/sources` and `/categories` are one place at a time.
 * What this screen has that nothing else does is the **score distribution** and
 * the **search history**: whether the thing that produces everything else is
 * still working.
 *
 * Every figure here reads the same period window as every other screen, so the
 * topbar's picker governs this page rather than being decoration on it. That is
 * why the page resolves the range itself instead of reading `getInsights()`:
 * the repository's own totals are unwindowed, and a card that ignored the picker
 * while sitting underneath it would be a lie the reader has no way to catch.
 */
export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  const ownerId = await requirePageUser();
  const [items, runs, health] = await Promise.all([
    listOpportunities(ownerId),
    listAcquisitionRuns(ownerId, 6),
    listSourceHealth(ownerId),
  ]);

  const now = new Date();
  // "All time" has no start of its own, so the oldest post defines it.
  const earliest = items.length
    ? new Date(Math.min(...items.map((item) => new Date(item.publishedAt).getTime())))
    : now;

  const resolved = resolveRange({ range, from, to }, earliest, now);
  // Same field, same windowing helper as `/`, `/sources` and `/categories`. See
  // `periodWindow` for why a post's own date and not when it was captured.
  const { current, previous } = periodWindow(items, (item) => item.publishedAt, resolved);

  const stats = insightStats(current, previous);
  const bands = bandCounts(current);
  const { stages, conversion } = funnel(current);

  const worth = worthCount(current);
  const blocked = health.filter((entry) => !entry.available);
  const searches = runs.map(summariseRun);

  return (
    <div className="space-y-3">
      {blocked.length > 0 ? (
        <p className="rounded-tile bg-warn-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-fg">
          <span className="font-medium">
            {blocked.map((entry) => sourceLabel(entry.providerId)).join(" and ")} can&rsquo;t be
            reached right now.
          </span>{" "}
          We stopped asking rather than keep trying. Everything below is what we already have.
        </p>
      ) : null}

      {/* The reference puts five figures across the top; so do we, in its order
          of shapes rather than its order of columns. */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((tile) => (
          <KpiCard
            key={tile.label}
            label={tile.label}
            value={tile.value}
            delta={tile.delta}
            note={tile.note}
          />
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="How the scores land"
            subtitle="Every opportunity found here, by how well it matches."
            action={
              <span className="text-[12px] text-fg-muted">
                {count(current.length)} scored
              </span>
            }
          />
          <CardBody>
            <BarChart data={bands} unit={{ one: " opportunity", many: " opportunities" }} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="From found to won"
            subtitle="Where they get to, and where they stop."
            action={<Pill tone="brand">{percent(conversion)}</Pill>}
          />
          <CardBody>
            <FunnelChart data={stages} />
          </CardBody>
        </Card>
      </section>

      {/* `items-start` so the dial's card is as tall as the dial. Without it the
          grid stretches it to match the search history beside it, leaving a card
          three-quarters empty — which reads as a panel that failed to load. */}
      <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card>
          <CardHeader
            title="Worth your time"
            subtitle={`Out of ${count(current.length)} found in this period.`}
          />
          <CardBody>
            {/* A share of a whole, which is what a dial is for: the number
                centred, the thing it is a share of stated beneath it. */}
            <Gauge value={worth} max={Math.max(1, current.length)} caption="worth pursuing" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Searches you've run"
            subtitle="Whether the sources feeding all of this are still answering."
          />
          <CardBody className="space-y-2 pt-2">
            {searches.map((search) => (
              <div key={search.id} className="rounded-tile border border-line px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[13px] font-medium text-fg">{search.headline}</p>
                  <span className="shrink-0 text-[12px] text-fg-muted">
                    {humanizeAge(search.completedAt)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] tabular-nums text-fg-muted">{search.breakdown}</p>
                {search.blocked.length > 0 && (
                  // Never folded into the count above. A run that came back
                  // empty because a source refused to answer is a different
                  // thing from one that came back empty because there was
                  // nothing there, and the operator can only act on the first.
                  <p className="mt-2 rounded-tile bg-warn-bg px-2.5 py-1.5 text-[12px] leading-relaxed text-fg">
                    {search.blocked.join(", and ")}.
                  </p>
                )}
              </div>
            ))}
            {searches.length === 0 && (
              <EmptyState
                title="No searches yet"
                body="Nothing has gone looking for opportunities so far. Run one from the opportunities list and its result lands here."
              />
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
