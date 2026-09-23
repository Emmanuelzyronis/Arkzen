import { GroupPanel } from "@/components/groups/group-panel";
import { GroupPicker } from "@/components/groups/group-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageUser } from "@/lib/api-auth";
import { listOpportunities, listSourceHealth } from "@/lib/data/repository";
import { groupOptions, resolveGroup, sourceGroups } from "@/lib/groups";
import { sourceLabel } from "@/lib/plain";
import { resolveRange } from "@/lib/window";

export const dynamic = "force-dynamic";

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; show?: string }>;
}) {
  const { range, from, to, show } = await searchParams;
  const ownerId = await requirePageUser();
  const [items, health] = await Promise.all([listOpportunities(ownerId), listSourceHealth(ownerId)]);

  const now = new Date();
  const earliest = items.length
    ? new Date(Math.min(...items.map((item) => new Date(item.publishedAt).getTime())))
    : now;
  const resolved = resolveRange({ range, from, to }, earliest, now);

  const groups = sourceGroups(items);
  const selected = resolveGroup(groups, show);

  // The reference shows the pills above everything, so they stay even when the
  // group has no rows in the chosen period — otherwise the only way to widen
  // the range would be to widen it blind.
  const blocked = health.filter((entry) => !entry.available);

  return (
    <div className="space-y-3">
      <GroupPicker groups={groupOptions(groups)} selected={selected?.key ?? null} />

      {blocked.length > 0 ? (
        <p className="rounded-tile bg-warn-bg px-3.5 py-3 text-[12.5px] leading-relaxed text-fg">
          <span className="font-medium">
            {blocked.map((entry) => sourceLabel(entry.providerId)).join(" and ")} can&rsquo;t be
            reached right now.
          </span>{" "}
          We stopped asking rather than keep trying. Everything below is what we already have.
        </p>
      ) : null}

      {selected ? (
        <GroupPanel items={items} range={resolved} group={selected} />
      ) : (
        <EmptyState
          title="Nothing to group yet"
          body="No leads yet — once you hit Find leads the pipeline fills up and sources start showing here."
        />
      )}
    </div>
  );
}
