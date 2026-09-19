import type { OpportunityListItem } from "@/lib/data/repository";
import { categoryLabel } from "@/lib/domain/category";
import {
  average,
  bestCount,
  rate,
  repliedCount,
  wonCount,
  worthCount,
  type Tile,
} from "@/lib/metrics";
import { change, count, percent } from "@/lib/plain";

/**
 * Grouping the opportunity list, and the figures each group shows.
 *
 * `/sources` and `/categories` are the same screen over two different keys —
 * the reference's "Other countries" panel, where the pills pick a country and
 * everything below reports on it. Rather than write that composition twice and
 * let the two drift, both pages come through here.
 *
 * It lives in `lib/` rather than in a component because the arithmetic is what
 * is worth testing; the markup around it is not.
 */

/**
 * A group as the pills need it: everything except how to match.
 *
 * Split out because `match` is a closure, and a closure cannot cross into a
 * client component — React serialises the props, and a function in them throws.
 * The picker only ever draws the label and the count, so it takes this and the
 * panel keeps the whole `Group`.
 */
export interface GroupOption {
  /** The stored value. Goes in the URL, so it must be stable across builds. */
  key: string;
  /** The words the interface shows. */
  label: string;
  /** How many leads are in it overall — the ordering, and nothing else. */
  total: number;
}

/**
 * The pills' view of the groups.
 *
 * This has to be a call, not just a type. `Group[]` is assignable to
 * `GroupOption[]` — extra properties on a non-literal are allowed — so passing
 * the groups straight through type-checks and then throws at runtime, because
 * React cannot serialise the `match` closure into a client component. Going
 * through a function that rebuilds each entry is the only version that cannot
 * be done wrong by accident.
 */
export function groupOptions(groups: Group[]): GroupOption[] {
  return groups.map(({ key, label, total }) => ({ key, label, total }));
}

/** One selectable group: a place leads come from, or a kind of work they are. */
export interface Group extends GroupOption {
  match: (item: OpportunityListItem) => boolean;
}

/** The raw tally for one grouping, before it is turned into `Group`s. */
interface Tally {
  key: string;
  label: string;
  total: number;
}

/**
 * Rank groups by size, largest first, ties alphabetically.
 *
 * Ties break on the label rather than on insertion order so the pills do not
 * reshuffle between two loads that found exactly the same thing.
 *
 * `keyOf` is a parameter rather than a shared variable on purpose: the `match`
 * closures below are called long after this returns, so a grouping that read
 * the accessor from anywhere but its own argument would answer for whichever
 * grouping was built last.
 */
function rank(
  entries: Tally[],
  keyOf: (item: OpportunityListItem) => string,
): Group[] {
  return entries
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .map((entry) => ({
      ...entry,
      match: (item: OpportunityListItem) => keyOf(item) === entry.key,
    }));
}

/** The places leads came from: `r/startups`, `r/devops`. */
export function sourceGroups(items: OpportunityListItem[]): Group[] {
  const keyOf = (item: OpportunityListItem) => item.sourceName;
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.sourceName, (totals.get(item.sourceName) ?? 0) + 1);
  return rank(
    [...totals.entries()].map(([name, total]) => ({ key: name, label: name, total })),
    keyOf,
  );
}

/** The kinds of work people are asking for. */
export function categoryGroups(items: OpportunityListItem[]): Group[] {
  const keyOf = (item: OpportunityListItem) => item.category;
  const totals = new Map<string, number>();
  for (const item of items) totals.set(item.category, (totals.get(item.category) ?? 0) + 1);
  return rank(
    [...totals.entries()].map(([slug, total]) => ({
      key: slug,
      label: categoryLabel(slug),
      total,
    })),
    keyOf,
  );
}

/**
 * Which group a request is asking for.
 *
 * Defaults to the largest rather than to nothing: landing on an empty panel
 * because no pill was clicked would make the page look broken on first visit.
 * An unrecognised key falls back the same way, so a stale bookmark still shows
 * a real screen.
 */
export function resolveGroup(groups: Group[], wanted: string | undefined): Group | null {
  if (groups.length === 0) return null;
  return groups.find((group) => group.key === wanted) ?? groups[0];
}

/**
 * The eight figures for one group, filling the 4×2 mini-grid.
 *
 * The first row counts, the second judges. The reference splits its grid the
 * same way — four volume numbers above four rate numbers — and the split earns
 * its keep: a "reply rate" belongs beside "average match score", not beside the
 * raw count it is derived from, where a reader is invited to check the division
 * by eye and find it does not come out.
 *
 * Deltas compare like with like. A *count* compares against the count in the
 * preceding period; a *rate* compares against that same rate over the preceding
 * period, which is what the reference's percentage chips do. Comparing a rate's
 * numerator instead would report "reply rate up 200%" when three people replied
 * and one did before. That rule lives in `lib/metrics.ts`, shared with
 * `/insights`, because two screens reporting one figure must compute it once.
 *
 * Every metric is derived from `payload` fields — `score` and `band` — or from
 * the live `status`/`outcome` columns. None of them is invented, and none reads
 * a field that never moves.
 */
export function groupStats(
  current: OpportunityListItem[],
  previous: OpportunityListItem[],
): Tile[] {
  const found = current.length;
  const beforeFound = previous.length;

  const worth = worthCount(current);
  const beforeWorth = worthCount(previous);

  const replied = repliedCount(current);
  const beforeReplied = repliedCount(previous);

  const won = wonCount(current);
  const beforeWon = wonCount(previous);

  const best = bestCount(current);
  const beforeBest = bestCount(previous);

  const score = average(current, (item) => item.score);
  const beforeScore = average(previous, (item) => item.score);

  const replyRate = rate(replied, found);
  const beforeReplyRate = rate(beforeReplied, beforeFound);
  const winRate = rate(won, found);
  const beforeWinRate = rate(beforeWon, beforeFound);

  return [
    {
      label: "Opportunities found",
      value: count(found),
      delta: change(found, beforeFound),
      note: "People describing a problem you can fix.",
    },
    {
      label: "Worth pursuing",
      value: count(worth),
      delta: change(worth, beforeWorth),
      note: "Cleared the fit check against what you sell.",
    },
    {
      label: "People who replied",
      value: count(replied),
      delta: change(replied, beforeReplied),
      note: "Someone wrote back.",
    },
    {
      label: "Won",
      value: count(won),
      delta: change(won, beforeWon),
      note: "Closed out as a win.",
    },
    {
      label: "Average match score",
      value: count(Math.round(score)),
      delta: change(Math.round(score), Math.round(beforeScore)),
      note: "Out of 100, across everything here.",
    },
    {
      label: "Best matches",
      value: count(best),
      // Named "best matches", not "strong matches": `bandLabel` already calls
      // the High band "Strong match" and the band below it "Good match", so a
      // tile called "Strong matches" could be read as either one.
      delta: change(best, beforeBest),
      note: "Scored 82 or above.",
    },
    {
      label: "Reply rate",
      value: percent(replyRate),
      delta: change(replyRate, beforeReplyRate),
      note: "Of everything found here.",
    },
    {
      label: "Win rate",
      value: percent(winRate),
      delta: change(winRate, beforeWinRate),
      note: "Of everything found here.",
    },
  ];
}
