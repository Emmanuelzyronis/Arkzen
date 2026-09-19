import { GroupPanel } from "@/components/groups/group-panel";
import { GroupPicker } from "@/components/groups/group-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { requirePageUser } from "@/lib/api-auth";
import { listOpportunities } from "@/lib/data/repository";
import { categoryGroups, groupOptions, resolveGroup } from "@/lib/groups";
import { resolveRange } from "@/lib/window";

export const dynamic = "force-dynamic";

/**
 * The same screen as `/sources`, over the kind of work instead of the place it
 * came from.
 *
 * There is no source-health notice here: a source being unreachable is a fact
 * about where leads come from, and it says nothing about what people are asking
 * for. Repeating it on this page would put the same warning on two screens and
 * make it easier to ignore on both.
 */
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; show?: string }>;
}) {
  const { range, from, to, show } = await searchParams;
  const ownerId = await requirePageUser();
  const items = await listOpportunities(ownerId);

  const now = new Date();
  const earliest = items.length
    ? new Date(Math.min(...items.map((item) => new Date(item.publishedAt).getTime())))
    : now;
  const resolved = resolveRange({ range, from, to }, earliest, now);

  const groups = categoryGroups(items);
  const selected = resolveGroup(groups, show);

  return (
    <div className="space-y-3">
      <GroupPicker groups={groupOptions(groups)} selected={selected?.key ?? null} />

      {selected ? (
        <GroupPanel items={items} range={resolved} group={selected} />
      ) : (
        <EmptyState
          title="Nothing to group yet"
          body="No opportunities have been found, so there is nothing to compare. Run a search from the opportunities list and this fills up."
        />
      )}
    </div>
  );
}
