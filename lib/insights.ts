import type { OpportunityListItem } from "@/lib/data/repository";
import { type Tile, average, rate, repliedCount, wonCount, worthCount } from "@/lib/metrics";
import { bandLabel, change, count, percent, runProblemLabel } from "@/lib/plain";
import { FUNNEL_STAGES, funnelCounts } from "@/lib/views";

/**
 * The figures behind `/insights` — the windowed performance report.
 *
 * The reference's "General metrics" screen is mostly composition of charts that
 * already exist, so there is little arithmetic here. What there is, is worth
 * keeping out of the page: the band distribution, the five headline figures, and
 * the reading of a search run. All three are the kind of thing that looks right
 * in a screenshot while being quietly wrong, so they are tested directly.
 *
 * This is a *report*, not an attention view. `/` answers "what needs me today";
 * `/sources` and `/categories` answer "how is this one place doing". Nothing
 * here is actionable except the search history, which says whether the thing
 * that feeds all of it is still working — which is why it is the one element on
 * the reference screen that no other page reproduces.
 */

/**
 * Every band, worst-inclusive, best-first.
 *
 * The internal names, in the order `bandForScore` produces them. The page draws
 * them through `bandLabel` — "Strong match", "Good match", "Worth a look",
 * "Weak match" — because "High" and "Watch" are the scoring layer's words.
 */
export const BANDS = ["High", "Strong", "Watch", "Low"] as const;

/**
 * How the scores land, as a distribution.
 *
 * Every band is returned, including the empty ones, so the chart's axis keeps
 * the same four columns from one period to the next. A distribution that
 * silently drops its empty buckets looks like it improved when it did not — the
 * Low column vanishing is the most interesting thing that can happen to it.
 *
 * The shape is written out rather than imported from the chart component: a
 * `lib/` module reaching into a client component for a type would invert the
 * layering, and it is two fields.
 */
export function bandCounts(items: OpportunityListItem[]): Array<{ label: string; value: number }> {
  return BANDS.map((band) => ({
    label: bandLabel(band),
    value: items.filter((item) => item.band === band).length,
  }));
}

/**
 * The five headline figures, in a row.
 *
 * Two counts, an average and two rates — the same mix of shapes the reference
 * puts in its top row, and the same count of them. "Best matches" is
 * deliberately not a sixth tile: the band distribution directly below is that
 * number, split by band, and a tile repeating one of its columns would invite
 * the reader to check the two against each other for no gain.
 *
 * These are the period's own figures, not ratios of the corpus: every one is
 * computed from the two arrays it is handed, so the period picker above them
 * governs all five and no tile can disagree with the charts below.
 */
export function insightStats(
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

  const score = Math.round(average(current, (item) => item.score));
  const beforeScore = Math.round(average(previous, (item) => item.score));

  const replyRate = rate(replied, found);
  const winRate = rate(won, found);

  return [
    {
      label: "Opportunities found",
      value: count(found),
      delta: change(found, beforeFound),
      note: "People who described a problem you can fix.",
    },
    {
      // Out of 100, which is what the scoring layer means by a score. A mean
      // rounded to a whole number: the one decimal place a raw average carries
      // is noise on a scale that is itself a judgement.
      label: "Average match score",
      value: `${score}`,
      delta: change(score, beforeScore),
      note: "Out of 100, across everything found here.",
    },
    {
      label: "Worth pursuing",
      value: count(worth),
      delta: change(worth, beforeWorth),
      note: "Cleared the fit check against what you sell.",
    },
    {
      // A rate compares against the previous period's *rate*, never against its
      // own numerator — a rule that lives in `lib/metrics.ts` and is shared with
      // the group screens. See `groupStats`.
      label: "Reply rate",
      value: percent(replyRate),
      delta: change(replyRate, rate(beforeReplied, beforeFound)),
      note: "Of everything found here, someone wrote back.",
    },
    {
      label: "Win rate",
      value: percent(winRate),
      delta: change(winRate, rate(beforeWon, beforeFound)),
      note: "Of everything found here, closed as won.",
    },
  ];
}

/**
 * The funnel, plus the one number worth pulling out of it.
 *
 * The conversion rate is the last stage over the first — how much of what was
 * found ends up won. Guarded at zero rather than left to divide: an empty period
 * is the ordinary first state of this screen, and `NaN%` in a card header is
 * exactly the kind of thing that gets read as a real figure.
 */
export function funnel(current: OpportunityListItem[]) {
  // `funnelCounts` returns plain numbers, one per stage, already guaranteed
  // non-increasing — see `furthestStage` for why that is structural rather than
  // hoped for.
  const counts = funnelCounts(current);
  const first = counts[0] ?? 0;
  const last = counts.at(-1) ?? 0;
  return {
    stages: FUNNEL_STAGES.map((label, index) => ({
      label,
      sub: count(counts[index] ?? 0),
      value: counts[index] ?? 0,
    })),
    conversion: rate(last, first),
  };
}

/** A search run as the screen reads it: one outcome, then how it got there. */
export interface RunSummary {
  id: string;
  /** When it finished, as stored. The page formats it. */
  completedAt: string;
  /** What it came to, in one sentence. */
  headline: string;
  /** The composition, terse: "15 read · 11 kept · 4 filtered out". */
  breakdown: string;
  /**
   * Sources that would not answer, as ready-made clauses.
   *
   * "Reddit wouldn't let us search", not "Reddit: ACCESS_RESTRICTED" and not
   * just "Reddit". Empty when every source answered. Never empty-but-silent: a
   * run that was partly blocked says so, because "nothing new" and "we were not
   * allowed to look" must never read the same.
   */
  blocked: string[];
}

/**
 * One run, described in the operator's words.
 *
 * `observed`, `kept`, `rejected`, `duplicates` and `created` are counts the
 * pipeline records, and the temptation is to narrate them all. The rule here is
 * to report what is *known*: the count is known, the reason behind it often is
 * not. `rejected` in particular is the sum of three unrelated things — posts
 * matching a pattern you blocked, posts from people selling rather than buying,
 * and posts too short to judge — and the run row stores only the total. So the
 * wording says "filtered out" and claims no reason, rather than guessing one and
 * telling the operator their search missed something it did not.
 */
export function summariseRun(run: {
  id: string;
  completedAt: string;
  observed: number;
  kept: number;
  rejected: number;
  duplicates: number;
  created: number;
  sourceRuns: Array<{ sourceName: string; status: string }>;
}): RunSummary {
  const parts: string[] = [`${count(run.observed)} read`];
  if (run.kept > 0) parts.push(`${count(run.kept)} kept`);
  if (run.rejected > 0) parts.push(`${count(run.rejected)} filtered out`);
  // "already had" reads better than "duplicates", which is the pipeline's word
  // for two posts being the same post.
  if (run.duplicates > 0) parts.push(`${count(run.duplicates)} you already had`);

  let headline: string;
  if (run.observed === 0) {
    // Said before the created-check, because "nothing came back" and "everything
    // that came back was familiar" are different problems: the first is a search
    // that is not reaching anything, the second is a search that is working.
    headline = "Nothing came back";
  } else if (run.created > 0) {
    headline = `${count(run.created)} new ${run.created === 1 ? "lead" : "leads"}`;
  } else if (run.duplicates > 0) {
    headline = `Nothing new — you already had all ${count(run.kept)} of these`;
  } else {
    headline = "Nothing new";
  }

  return {
    id: run.id,
    completedAt: run.completedAt,
    headline,
    breakdown: parts.join(" · "),
    blocked: run.sourceRuns
      .filter((entry) => blockedStatus(entry.status))
      .map((entry) => {
        // The run's own `sourceName`, deliberately not through `sourceLabel`:
        // that maps a provider *id* to a name, and these are already names.
        // Running a correct name through it would re-case it. The *reason*, by
        // contrast, comes from `runProblemLabel`, because a run status is an
        // internal identifier and "ACCESS_RESTRICTED" must never reach a screen.
        const reason = runProblemLabel(entry.status);
        return reason ? `${entry.sourceName} ${reason}` : `${entry.sourceName} didn't answer`;
      }),
  };
}

/**
 * Whether a source's own status counts as a refusal.
 *
 * Only `SUCCESS` and `PARTIAL_SUCCESS` count as answering. Listed as the two
 * good outcomes rather than the six bad ones so a status added later is treated
 * as a problem until someone decides otherwise — the failure that matters here
 * is a blocked source going unmentioned, not a working one being flagged twice.
 */
function blockedStatus(status: string): boolean {
  return status !== "SUCCESS" && status !== "PARTIAL_SUCCESS";
}
