import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export const dynamic = "force-dynamic";

/**
 * Help and support — the plain-language vocabulary, and how the search works.
 *
 * No reference image depicts this screen, so it is built in the card language of
 * the screens either side of it rather than copied from anything. Two things it
 * deliberately does not do.
 *
 * It does not invent a support channel. There is no chat widget, no mailbox and
 * no ticketing route in this app, and a "Contact us" button that posted nowhere
 * would be the worst kind of help page: the one you reach when something has
 * gone wrong, which then quietly does nothing. What the page offers instead is
 * the thing it can actually do — explain the words the screens use and where the
 * numbers come from.
 *
 * It does not repeat the app's own figures. Everything here is a definition or a
 * rule, so the page stays true whatever the period picker is set to. The two
 * places a reader would want to go next — where leads come from, and the search
 * history — are links, not summaries.
 */
export default function HelpPage() {
  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <Card>
          <CardHeader
            title="What Arkzen does"
            subtitle="Four steps, from the moment a post goes up to the moment you know how it went."
          />
          <CardBody>
            {/* An ordered list, not numbered decoration: these four really do
                happen in this order, and each one depends on the one above it. */}
            <ol className="space-y-3">
              {[
                {
                  step: "It looks in the places people ask for work.",
                  detail:
                    "Each place is searched on its own. One of them being unreachable does not stop the others.",
                },
                {
                  step: "It reads each post and works out how well it matches what you sell.",
                  detail:
                    "Every post gets a match score out of 100, and the checks behind that score are kept with it.",
                },
                {
                  step: "The ones that clear your fit check land in All opportunities.",
                  detail:
                    "A post that is clearly not the work you take on is dropped before it is scored, so it never appears.",
                },
                {
                  step: "You reach out, and what happened is written on the lead.",
                  detail:
                    "Marking a lead in progress, done or won is what turns the search into the numbers on Insights.",
                },
              ].map((item, index) => (
                <li key={item.step} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-medium tabular-nums text-brand"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-fg">{item.step}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What the words mean"
            subtitle="Every term these screens use, in the sense this app uses it."
          />
          <CardBody>
            <dl className="space-y-3">
              {[
                {
                  term: "Opportunity",
                  meaning:
                    "A post from someone describing work you could do. It keeps the original text, so you can always read what they actually said.",
                },
                {
                  term: "Match score",
                  meaning:
                    "How well the post lines up with what you sell, out of 100. It is worked out once, when the lead is found, and kept as it was.",
                },
                {
                  term: "Fit check",
                  meaning:
                    "The first pass: is this the kind of work you take on at all? Budget, location and the words you have ruled out are checked here.",
                },
                {
                  term: "Worth pursuing",
                  meaning:
                    "Cleared the fit check and still open. Nothing has happened on it yet.",
                },
                {
                  term: "In progress",
                  meaning: "You have reached out and are waiting on them.",
                },
                {
                  term: "Done",
                  meaning:
                    "Finished either way — won, lost, or ruled out. The outcome is written on the lead.",
                },
                {
                  term: "Reply rate",
                  meaning:
                    "Of everything the search found, how much got an answer back. Posts that turned out to be automated are left out of it.",
                },
                {
                  term: "Blocked search",
                  meaning:
                    "A place we could not look, or could only look at part of. It is reported against that one source; the rest of the search still runs.",
                },
              ].map((entry) => (
                <div key={entry.term}>
                  <dt className="text-[13px] font-medium text-fg">{entry.term}</dt>
                  <dd className="mt-0.5 text-[13px] leading-relaxed text-fg-soft">
                    {entry.meaning}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader title="Where leads come from" />
          <CardBody className="space-y-3">
            <p className="text-[13px] leading-relaxed text-fg-soft">
              Posts are collected from the places people publicly ask for work, and from captures
              that have been reviewed by hand.
            </p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Each source keeps its own record: what it returned last time, and whether it answered
              at all. When one refuses a search, that is recorded against that source alone and the
              rest of the search carries on — so a source going quiet is never silent, and never
              stops the others.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link href="/sources">See every source</Link>
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="If something looks wrong" />
          <CardBody className="space-y-3">
            <p className="text-[13px] leading-relaxed text-fg-soft">
              Insights carries the history of every search: when it ran, what came back, and what
              went wrong if anything did.
            </p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              If a figure on another screen disagrees with it, the run history is where the
              difference will show up.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link href="/insights">Open Insights</Link>
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
