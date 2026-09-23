import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { BarChart, FunnelChart, Gauge, SegmentedColumn, TrendChart } from "@/components/charts/charts";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DeltaPill, Dot, Pill } from "@/components/ui/pill";
import { busiestIndex, countPerBucket, runningRate, share } from "@/lib/charts";
import { requirePageUser } from "@/lib/api-auth";
import { listOpportunities, listSourceHealth, listAcquisitionRuns, getServiceProfile, type OpportunityListItem } from "@/lib/data/repository";
import { summariseRun } from "@/lib/insights";
import { categoryLabel } from "@/lib/domain/category";
import { humanizeAge } from "@/lib/domain/text";
import { change, count, percent, sourceLabel } from "@/lib/plain";
import { tallySeries } from "@/lib/series";
import { isReplied, isWorthPursuing, FUNNEL_STAGES, funnelCounts } from "@/lib/views";
import { periodWindow, resolveRange } from "@/lib/window";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { range, from, to } = await searchParams;
  // The signed-in person, and therefore the only rows this page can read.
  const ownerId = await requirePageUser();

  // First-time visitors who have not set up their profile go to onboarding.
  const profile = await getServiceProfile(ownerId);
  if (!profile) redirect("/onboarding");
  const [items, health, rawRuns] = await Promise.all([
    listOpportunities(ownerId),
    listSourceHealth(ownerId),
    listAcquisitionRuns(ownerId, 4),
  ]);
  const recentRuns = rawRuns.map(summariseRun);

  const now = new Date();
  // "All time" has no start of its own, so the oldest post defines it.
  const earliest = items.length
    ? new Date(Math.min(...items.map((item) => new Date(item.publishedAt).getTime())))
    : now;

  const resolved = resolveRange({ range, from, to }, earliest, now);
  // Every figure on this page reads the same window, measured from when a post
  // was written. See `periodWindow` for why `publishedAt` and not `capturedAt`.
  const period = periodWindow(items, (item) => item.publishedAt, resolved);
  const { current, previous, buckets } = period;

  const perBucket = (match: (item: OpportunityListItem) => boolean) =>
    countPerBucket(
      current.filter(match),
      buckets,
      (item) => item.publishedAt,
    );

  const foundPerBucket = perBucket(() => true);
  const worthPerBucket = perBucket(isWorthPursuing);
  const repliedPerBucket = perBucket(isReplied);

  // Running rates read better than daily noise when the window is short.
  const worthRate = runningRate(worthPerBucket, foundPerBucket);
  const replyRate = runningRate(repliedPerBucket, foundPerBucket);

  const sources = tallySeries(current, previous, (item) => item.sourceName);
  const topSources = sources.slice(0, 5);
  const topTotal = topSources.reduce((sum, row) => sum + row.value, 0);
  const blocked = health.filter((entry) => !entry.available);
  const awaiting = current.filter((item) => item.status === "NEW" || item.status === "REVIEWING").length;

  const worth = current.filter(isWorthPursuing).length;
  const replied = current.filter(isReplied).length;
  const won = current.filter((item) => item.outcome === "WON").length;
  // Stage counts come from one nesting function, so the funnel can never show a
  // later stage taller than an earlier one.
  const stageCounts = funnelCounts(current);
  const busiest = busiestIndex(foundPerBucket);

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Opportunities found"
          value={count(current.length)}
          delta={change(current.length, previous.length)}
          note="People describing a problem you can fix."
        />
        <KpiCard
          label="Worth pursuing"
          value={count(worth)}
          delta={change(worth, previous.filter(isWorthPursuing).length)}
          note="Checked against what you sell."
        />
        <KpiCard
          label="Reply rate"
          value={percent(share(replied, current.length))}
          delta={change(replied, previous.filter(isReplied).length)}
          note={`${count(replied)} ${replied === 1 ? "person" : "people"} replied.`}
        />
        <KpiCard
          label="Won"
          value={count(won)}
          delta={change(won, previous.filter((item) => item.outcome === "WON").length)}
          note={`${count(awaiting)} still waiting on you.`}
        />
      </section>

      {/* The reference's dark hero block: headline figures, split bar, ranked rows. */}
      <section className="overflow-hidden rounded-card bg-hero text-hero-fg shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Where they came from</h2>
            <p className="mt-1 text-[13px] text-hero-muted">The five places producing the most leads right now.</p>
          </div>
          <span className="text-[12px] text-hero-muted">Compared to the period before</span>
        </div>

        <div className="flex flex-wrap items-end gap-x-12 gap-y-4 px-5 pt-5">
          <div>
            <div className="text-[13px] text-hero-muted">
              Top {topSources.length} {topSources.length === 1 ? "source" : "sources"}
            </div>
            <div className="mt-1.5 text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
              {count(topTotal)}
            </div>
          </div>
          <div>
            <div className="text-[13px] text-hero-muted">Everything else</div>
            <div className="mt-1.5 text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-hero-muted">
              {count(Math.max(0, current.length - topTotal))}
            </div>
          </div>
        </div>

        <div className="px-5 pt-5">
          <div className="flex h-2.5 w-full gap-1 overflow-hidden rounded-full">
            {topTotal === 0 ? (
              <span className="h-full w-full rounded-full bg-white/10" />
            ) : (
              topSources.map((row) => (
                <span
                  key={row.name}
                  className="h-full rounded-full"
                  style={{ width: `${(row.value / Math.max(1, current.length)) * 100}%`, background: row.color }}
                />
              ))
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
            {topSources.map((row) => (
              <span key={row.name} className="inline-flex items-center gap-1.5 text-[12px] text-hero-muted">
                <Dot color={row.color} />
                <span className="font-medium tabular-nums text-hero-fg">{row.value}</span>
                {row.name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-5 overflow-x-auto border-t border-white/10">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-hero-muted">
                <th className="px-5 py-2.5 font-medium">Source</th>
                <th className="px-5 py-2.5 text-right font-medium">Leads</th>
                <th className="px-5 py-2.5 text-right font-medium">Share</th>
                <th className="px-5 py-2.5 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((row) => (
                <tr key={row.name} className="border-t border-white/10">
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2">
                      <Dot color={row.color} />
                      {row.name}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{count(row.value)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-hero-muted">
                    {percent(share(row.value, current.length))}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <DeltaPill value={change(row.value, row.before)} />
                  </td>
                </tr>
              ))}
              {topSources.length === 0 && (
                <tr className="border-t border-white/10">
                  <td colSpan={4} className="px-5 py-10 text-center text-hero-muted">
                    Nothing found in this period yet. Run a search to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Found per day"
            subtitle="How many new opportunities showed up."
            action={
              <span className="text-[12px] text-fg-muted">
                {count(current.length)} in this period
              </span>
            }
          />
          <CardBody>
            <BarChart
              data={buckets.map((bucket, index) => ({ label: bucket.label, value: foundPerBucket[index] }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="How often they lead somewhere" subtitle="Out of everything found so far." />
          <CardBody>
            <TrendChart
              labels={buckets.map((bucket) => bucket.label)}
              series={[
                { name: "Worth pursuing", color: "var(--brand)", values: worthRate },
                { name: "Replied", color: "#38bdf8", values: replyRate },
              ]}
            />
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="From found to won"
            subtitle="Where the opportunities are, and where they stop."
            action={
              <span className="text-[12px] text-fg-muted">
                {percent(share(won, current.length))} end in a win
              </span>
            }
          />
          <CardBody>
            <FunnelChart
              data={FUNNEL_STAGES.map((label, index) => ({
                label,
                sub: count(stageCounts[index] ?? 0),
                value: stageCounts[index] ?? 0,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Still in play" subtitle={`Out of ${count(current.length)} found.`} />
          <CardBody>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <Gauge value={worth} max={Math.max(1, current.length)} caption="worth pursuing" />
              <div className="hidden w-24 sm:block">
                <SegmentedColumn
                  segments={buckets.map((bucket, index) => ({
                    label: bucket.label,
                    value: foundPerBucket[index] + worthPerBucket[index],
                  }))}
                  activeIndex={busiest < 0 ? 0 : busiest}
                  callout={
                    <>
                      <span className="block text-fg-muted">Busiest day</span>
                      {buckets[busiest < 0 ? 0 : busiest]?.label} · {foundPerBucket[busiest < 0 ? 0 : busiest] ?? 0} found
                    </>
                  }
                  height={150}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Needs you today" subtitle="The newest things worth a look." />
          <CardBody className="space-y-2 pt-2">
            {blocked.length > 0 && (
              <div className="rounded-tile bg-warn-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-fg">
                <span className="font-medium">
                  {blocked.map((entry) => sourceLabel(entry.providerId)).join(" and ")} can&rsquo;t be reached right now.
                </span>{" "}
                We stopped asking rather than keep trying, and these are the results we already have.
              </div>
            )}
            {current.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                href={`/opportunities/${item.id}`}
                className="block rounded-tile border border-line px-3.5 py-3 transition-colors hover:bg-surface-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-[13px] font-medium leading-snug text-fg">{item.title}</p>
                  <Pill tone="brand" className="shrink-0">
                    {item.score}
                  </Pill>
                </div>
                <p className="mt-1.5 line-clamp-1 text-[12px] text-fg-muted">
                  {item.sourceName} · {humanizeAge(item.publishedAt)}
                </p>
              </Link>
            ))}
            {current.length === 0 && (
              <p className="py-8 text-center text-[13px] text-fg-muted">
                Nothing in this period. Try a longer time range above.
              </p>
            )}
            <Link
              href="/opportunities"
              className="inline-flex items-center gap-1 pt-1 text-[13px] font-medium text-brand hover:underline"
            >
              See everything <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="What people are asking for" subtitle="Grouped by the kind of work it is." />
          <CardBody className="space-y-2 pt-3">
            {Object.entries(
              current.reduce<Record<string, number>>((accumulator, item) => {
                accumulator[item.category] = (accumulator[item.category] ?? 0) + 1;
                return accumulator;
              }, {}),
            )
              .sort(([, a], [, b]) => b - a)
              .map(([category, value]) => (
                <div key={category} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-[13px] text-fg-soft">
                    {categoryLabel(category)}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${(value / Math.max(1, current.length)) * 100}%` }}
                    />
                  </span>
                  <span className="w-6 text-right text-[13px] tabular-nums text-fg">{value}</span>
                </div>
              ))}
            {current.length === 0 && (
              <p className="py-8 text-center text-[13px] text-fg-muted">Nothing to group yet.</p>
            )}
          </CardBody>
        </Card>
      </section>

      <Card>
        <CardHeader title="Recent searches" subtitle="The last few times Find leads ran, and what came back." />
        <CardBody className="space-y-2 pt-2">
          {recentRuns.map((run) => (
            <div key={run.id} className="rounded-tile border border-line px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13px] font-medium text-fg">{run.headline}</p>
                <span className="shrink-0 text-[12px] text-fg-muted">{humanizeAge(run.completedAt)}</span>
              </div>
              <p className="mt-1 text-[12px] tabular-nums text-fg-muted">{run.breakdown}</p>
              {run.blocked.length > 0 && (
                <p className="mt-2 rounded-tile bg-warn-bg px-2.5 py-1.5 text-[12px] leading-relaxed text-fg">
                  {run.blocked.join(", and ")}.
                </p>
              )}
            </div>
          ))}
          {recentRuns.length === 0 && (
            <p className="py-6 text-center text-[13px] text-fg-muted">
              No searches yet. Hit Find leads and the history shows up here.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
