import { ArrowUpRight, CircleHelp, ExternalLink, MessageSquare } from "lucide-react";

import { RecordOutcome } from "@/components/opportunities/record-outcome";
import { CopyButton } from "@/components/ui/copy-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Meter } from "@/components/ui/data-table";
import { Pill } from "@/components/ui/pill";
import { categoryLabel } from "@/lib/domain/category";
import { humanizeAge } from "@/lib/domain/text";
import type { DimensionScore, Opportunity, ScoreCheck } from "@/lib/domain/types";
import { activityLabel, actorLabel, bandLabel, outcomeLabel, statusLabel } from "@/lib/plain";
import { longDay } from "@/lib/window";

/**
 * One lead, in full.
 *
 * The screen is built around a distinction the data forces. Everything under
 * "Why it scored this way", plus the plan and the next step, comes out of
 * `payload` — a snapshot written once when the post was found and never
 * recomputed. Only the stage, the outcome, the notes and the conversation move.
 * So the read-only half says when it was taken, and the writable half is the
 * only half that offers controls. A screen that let you re-score, or that saved
 * an edit to a draft nothing re-reads, would be promising the app something it
 * cannot do.
 */
export function OpportunityDetail({ opportunity }: { opportunity: Opportunity }) {
  const { signal } = opportunity;
  const scoredAt = longDay(new Date(opportunity.createdAt));
  const dimension = [
    { label: "Fit", detail: "How closely this matches what you sell.", value: opportunity.fit },
    { label: "Intent", detail: "How clearly they're asking for it.", value: opportunity.intent },
    { label: "Urgency", detail: "How soon they need it.", value: opportunity.urgency },
    {
      label: "Reach",
      detail: "How easy they are to get in touch with.",
      value: opportunity.reachability,
    },
  ];

  return (
    <div className="space-y-3">
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              {/* An `h2`, not an `h1`: the topbar already carries this page's
                  heading ("Opportunity", from `routeMeta`), and `CardHeader`
                  renders every section below as an `h2`. A second `h1` here
                  would put two page-level headings on one screen and leave this
                  one a peer of its own sections rather than their parent. */}
              <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.02em] text-fg">
                {signal.title}
              </h2>
              <p className="mt-1.5 text-[12px] text-fg-muted">
                {/* `sourceName` is the community the post is in — "r/startups" —
                    which is what a person recognises. `providerId` is the
                    adapter that fetched it and never appears. */}
                {signal.sourceName} · {categoryLabel(opportunity.category)} · posted{" "}
                {humanizeAge(signal.publishedAt)}
              </p>
            </div>
            {signal.canonicalUrl ? (
              <a
                href={signal.canonicalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-medium text-fg transition-colors hover:bg-surface-3"
              >
                Open the post
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </a>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Pill tone={opportunity.band === "High" || opportunity.band === "Strong" ? "brand" : "neutral"}>
              {opportunity.score} · {bandLabel(opportunity.band)}
            </Pill>
            <Pill tone="outline">{statusLabel(opportunity.status)}</Pill>
            {opportunity.outcome ? (
              <Pill tone="outline">{outcomeLabel(opportunity.outcome)}</Pill>
            ) : null}
          </div>

          <p className="text-[13px] leading-relaxed text-fg-soft">{opportunity.matchReason}</p>
        </CardBody>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="What was said"
              subtitle={`Reproduced from ${signal.sourceName}. The evidence every number on this page was built from.`}
            />
            <CardBody>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-soft">
                {signal.content}
              </p>
              {signal.author.publicContext && signal.author.publicContext.length > 0 ? (
                <div className="mt-4 border-t border-line pt-3">
                  <p className="text-[11px] font-medium text-fg-muted">
                    About {signal.author.handle}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {signal.author.publicContext.map((line) => (
                      <li key={line} className="flex gap-2 text-[12px] leading-relaxed text-fg-soft">
                        <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-muted" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Why it scored this way"
              // The one thing a reader must not get wrong about this card.
              subtitle={`Measured once, when this was found on ${scoredAt}. It does not change as the conversation moves.`}
            />
            <CardBody className="space-y-4">
              {dimension.map((entry) => (
                <Dimension
                  key={entry.label}
                  label={entry.label}
                  detail={entry.detail}
                  value={entry.value}
                />
              ))}
            </CardBody>
          </Card>

          {signal.canonicalUrl ? (
            <Card>
              <CardHeader
                title="Reply to this"
                subtitle="A draft opener — copy it, open the thread, paste and personalise."
              />
              <CardBody className="space-y-3">
                {opportunity.strategy.suggestedMessage ? (
                  <div className="rounded-tile bg-surface-2 px-3 py-2.5">
                    <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-fg-soft">
                      {opportunity.strategy.suggestedMessage}
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {opportunity.strategy.suggestedMessage ? (
                    <CopyButton text={opportunity.strategy.suggestedMessage} label="Copy draft" />
                  ) : null}
                  <a
                    href={signal.canonicalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-brand-bright"
                  >
                    <MessageSquare aria-hidden="true" className="size-3.5" />
                    Open thread
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                </div>
                {opportunity.strategy.evidenceUsed.length > 0 ? (
                  <div className="border-t border-line pt-3">
                    <p className="text-[11px] font-medium text-fg-muted">Matched because</p>
                    <ul className="mt-1.5 space-y-1">
                      {opportunity.strategy.evidenceUsed.map((line) => (
                        <li key={line} className="text-[12px] leading-relaxed text-fg-muted">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          <RecordOutcome
            opportunityId={opportunity.id}
            status={opportunity.status}
            outcome={opportunity.outcome}
            outcomeNote={opportunity.outcomeNote}
          />
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title="At a glance" />
            <CardBody className="space-y-3">
              <Verdict opportunity={opportunity} />
              {opportunity.qualification.whyQualified.length > 0 ? (
                <Bullets
                  label="Why it's worth a look"
                  items={opportunity.qualification.whyQualified}
                  tone="up"
                />
              ) : null}
              {opportunity.reasons.length > 0 ? (
                <Bullets label="What stood out" items={opportunity.reasons} tone="neutral" />
              ) : null}
              {opportunity.risks.length > 0 ? (
                <Bullets label="What could go wrong" items={opportunity.risks} tone="down" />
              ) : null}
              {opportunity.qualification.unknowns.length > 0 ? (
                <Bullets
                  label="Nobody has checked yet"
                  items={opportunity.qualification.unknowns}
                  tone="warn"
                />
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Do this next"
              subtitle={`Chosen on ${scoredAt}, when this was found.`}
            />
            <CardBody className="space-y-2">
              <p className="text-[13px] font-medium leading-relaxed text-fg">
                {opportunity.nextAction.action}
              </p>
              <p className="text-[12px] leading-relaxed text-fg-muted">
                {opportunity.nextAction.rationale}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Pill tone="outline">By {opportunity.nextAction.due}</Pill>
                <Pill tone="outline">Via {opportunity.nextAction.channel}</Pill>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="What's happened"
              subtitle="Everything recorded against this lead, oldest first."
            />
            <CardBody>
              {opportunity.activities.length === 0 ? (
                <p className="text-[13px] leading-relaxed text-fg-muted">
                  Nothing recorded yet. Notes and stages you save below appear here.
                </p>
              ) : (
                <ol className="space-y-3">
                  {opportunity.activities.map((activity) => (
                    <li key={activity.id} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-line-strong"
                      />
                      <div className="min-w-0">
                        <p className="text-[12px] leading-relaxed text-fg-soft">
                          <span className="font-medium text-fg">{activityLabel(activity.kind)}</span>
                          {" · "}
                          {actorLabel(activity.actor)}
                          {" · "}
                          <span className="text-fg-muted">{humanizeAge(activity.createdAt)}</span>
                        </p>
                        <p className="mt-0.5 text-[12px] leading-relaxed text-fg-soft">
                          {activity.summary}
                        </p>
                        {activity.statusFrom && activity.statusTo ? (
                          <p className="mt-0.5 text-[11px] text-fg-muted">
                            {statusLabel(activity.statusFrom)} → {statusLabel(activity.statusTo)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

/**
 * A dimension with its working shown.
 *
 * The checks are the reason to trust the number, so they are listed rather than
 * hidden behind a tooltip. An `unknown` check is drawn differently from a `warn`
 * one on purpose: "we could not tell" and "we checked and it's a problem" are
 * different findings, and `research.ts` promises they are never blended.
 */
function Dimension({
  label,
  detail,
  value,
}: {
  label: string;
  detail: string;
  value: DimensionScore;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-fg">{label}</p>
        <p className="text-[15px] font-semibold tabular-nums text-fg">{value.value}</p>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <span className="w-full max-w-[220px]">
          <Meter value={value.value} max={100} />
        </span>
        <span className="text-[12px] text-fg-muted">{detail}</span>
      </div>
      {value.checks.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {value.checks.map((check) => (
            <Check key={check.label} check={check} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The three states a check can be in, in words.
 *
 * These describe the *finding*, not the process. Labelling `unknown` "Not
 * checked" asserted that nobody had looked, which is false for a check like
 * "2 of 6 capabilities requested — matched: Next.js, React" — that one was
 * looked at, and came back partial. `scoring.ts` uses `unknown` for both "we
 * could not tell" and "we could not tell *yet*", so the honest word is the one
 * that covers both. The colour still separates the three at a glance, and the
 * label is always present so the status never depends on colour alone.
 */
const CHECK_TONE: Record<ScoreCheck["status"], { text: string; label: string }> = {
  pass: { text: "text-up", label: "Good" },
  warn: { text: "text-down", label: "Problem" },
  unknown: { text: "text-fg-muted", label: "Unclear" },
};

function Check({ check }: { check: ScoreCheck }) {
  const tone = CHECK_TONE[check.status];
  return (
    <li className="flex gap-2 text-[12px] leading-relaxed">
      <span className={`w-[68px] shrink-0 text-[11px] font-medium ${tone.text}`}>{tone.label}</span>
      <span className="min-w-0 text-fg-soft">
        {check.label}
        <span className="text-fg-muted"> — {check.detail}</span>
      </span>
    </li>
  );
}

function Angle({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-tile bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] font-medium text-fg-muted">{label}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-fg-soft">{body}</p>
    </div>
  );
}

function Bullets({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: "up" | "down" | "warn" | "neutral";
}) {
  const dot =
    tone === "up" ? "bg-up" : tone === "down" ? "bg-down" : tone === "warn" ? "bg-warn" : "bg-fg-muted";
  return (
    <div>
      <p className="text-[11px] font-medium text-fg-muted">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-fg-soft">
            <span aria-hidden="true" className={`mt-1.5 size-1 shrink-0 rounded-full ${dot}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The headline answer to "should I bother", with its confidence stated. */
function Verdict({ opportunity }: { opportunity: Opportunity }) {
  const { verdict, confidence, authenticity } = opportunity.qualification;
  const headline =
    verdict === "QUALIFIED"
      ? "Worth your time"
      : verdict === "NEEDS_REVIEW"
        ? "Worth a closer look"
        : "Probably not a fit";

  return (
    <div className="rounded-tile bg-surface-2 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-fg">{headline}</p>
        <Pill tone={verdict === "QUALIFIED" ? "brand" : verdict === "WEAK" ? "down" : "neutral"}>
          {confidence}% sure
        </Pill>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-[12px] leading-relaxed text-fg-muted">
        <CircleHelp aria-hidden="true" className="size-3.5 shrink-0" />
        {authenticity.label} — {authenticity.notes[0] ?? "nothing unusual in how it was written."}
      </p>
    </div>
  );
}
