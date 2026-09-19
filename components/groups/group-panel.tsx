import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DeltaPill, Pill } from "@/components/ui/pill";
import { KpiCard } from "@/components/kpi-card";
import { BarChart, TrendChart } from "@/components/charts/charts";
import { busiestIndex, countPerBucket, runningRate, share } from "@/lib/charts";
import type { OpportunityListItem } from "@/lib/data/repository";
import { groupStats, type Group } from "@/lib/groups";
import { change, count, percent } from "@/lib/plain";
import { isReplied } from "@/lib/views";
import { longDay, periodWindow, type ResolvedRange } from "@/lib/window";

/**
 * The reference's "Other countries" screen: one group's figures, its daily
 * chart, and its rates.
 *
 * Deliberately not centred on anything but the two headline figures, matching
 * the reference — everything else is a left-aligned row in a table, and the
 * centred treatment is reserved for the number that is a statement rather than
 * an entry.
 */
export function GroupPanel({
  items,
  range,
  group,
}: {
  /** Every opportunity, unwindowed — the panel does its own windowing. */
  items: OpportunityListItem[];
  range: ResolvedRange;
  group: Group;
}) {
  // Windowing happens here rather than in the page so both callers cannot
  // disagree: the KPI grid and the two charts must read the same period, and
  // the moment that is spread across two files it stops being obvious.
  const period = periodWindow(items, (item) => item.publishedAt, range);
  const current = period.current.filter(group.match);
  const previous = period.previous.filter(group.match);
  const { buckets } = period;

  const foundPerBucket = countPerBucket(current, buckets, (item) => item.publishedAt);
  // Read through the shared predicates rather than by naming the statuses here.
  // `lib/views.ts` exists so that "worth pursuing" and "replied" mean one thing
  // across the whole app; a copy of the list is how the copies start disagreeing.
  const repliedPerBucket = countPerBucket(
    current.filter(isReplied),
    buckets,
    (item) => item.publishedAt,
  );
  const wonPerBucket = countPerBucket(
    current.filter((item) => item.outcome === "WON"),
    buckets,
    (item) => item.publishedAt,
  );

  const replyRate = runningRate(repliedPerBucket, foundPerBucket);
  const winRate = runningRate(wonPerBucket, foundPerBucket);

  const peak = busiestIndex(foundPerBucket);
  const stats = groupStats(current, previous);

  const lastReply = replyRate[replyRate.length - 1] ?? 0;
  const lastWin = winRate[winRate.length - 1] ?? 0;
  const beforeReply = share(previous.filter(isReplied).length, previous.length);
  const beforeWin = share(
    previous.filter((item) => item.outcome === "WON").length,
    previous.length,
  );

  const span = `${longDay(range.start)} – ${longDay(range.end)}`;

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <KpiCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            delta={stat.delta}
            note={stat.note}
          />
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            title="Opportunities found"
            action={<span className="text-[12px] tabular-nums text-fg-muted">{span}</span>}
          />
          <CardBody className="pt-1">
            {/* The reference's centred headline: the period's peak day, with the
                bar it refers to pinned below so the two plainly agree. */}
            <div className="flex flex-col items-center pb-5 pt-2 text-center">
              <span className="text-[13px] text-fg-soft">Busiest day</span>
              <span className="mt-1.5 text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-fg">
                {count(peak < 0 ? 0 : foundPerBucket[peak])}
              </span>
              <span className="mt-2.5 inline-flex items-center gap-1.5">
                <Pill tone="neutral">
                  {peak < 0 ? "Nothing yet" : (buckets[peak]?.label ?? "")}
                </Pill>
                <span className="text-[12px] text-fg-muted">
                  {percent(share(peak < 0 ? 0 : foundPerBucket[peak], current.length))} of this period
                </span>
              </span>
            </div>
            <BarChart
              data={buckets.map((bucket, index) => ({
                label: bucket.label,
                value: foundPerBucket[index],
              }))}
              defaultActive={peak < 0 ? undefined : peak}
              unit={{ one: " lead", many: " leads" }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Rates"
            action={<span className="text-[12px] tabular-nums text-fg-muted">{span}</span>}
          />
          <CardBody className="pt-2">
            {/* The reference puts its two series values above the lines with
                their change chips, so the reader has the endpoints before
                reading the shape. */}
            <div className="flex flex-wrap gap-x-8 gap-y-3 pb-4">
              <div>
                <span className="flex items-center gap-1.5 text-[12px] text-fg-soft">
                  <span aria-hidden="true" className="size-2 rounded-full bg-brand" />
                  Reply rate
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-fg">
                    {percent(lastReply)}
                  </span>
                  <DeltaPill value={change(lastReply, beforeReply)} />
                </span>
              </div>
              <div>
                <span className="flex items-center gap-1.5 text-[12px] text-fg-soft">
                  <span aria-hidden="true" className="size-2 rounded-full bg-[#38bdf8]" />
                  Win rate
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-fg">
                    {percent(lastWin)}
                  </span>
                  <DeltaPill value={change(lastWin, beforeWin)} />
                </span>
              </div>
            </div>
            <TrendChart
              labels={buckets.map((bucket) => bucket.label)}
              series={[
                { name: "Reply rate", color: "var(--brand)", values: replyRate },
                { name: "Win rate", color: "#38bdf8", values: winRate },
              ]}
            />
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
