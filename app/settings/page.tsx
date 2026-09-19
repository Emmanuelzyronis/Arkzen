import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import { blockedReasonLabels } from "@/lib/plain";

export const dynamic = "force-dynamic";

/**
 * Settings — "what this workspace is looking for".
 *
 * The topbar's profile pill has linked here with the title *What you're looking
 * for* since the shell was built, so this page has one job it must do: show the
 * profile that every score, strategy line and draft on every other screen is
 * derived from. It is read straight out of `lib/domain/service-profile.ts` —
 * the same object `scoring.ts` and `pipeline.ts` read — so the page cannot
 * describe a profile the product is not actually using.
 *
 * What it deliberately does **not** do is offer to edit it. There is no settings
 * table and nothing is persisted, so an editor here would collect changes and
 * drop them; worse, `payload` is a frozen snapshot written at capture time, so
 * changing the profile would not re-score a single opportunity already in the
 * list — the page would appear to have worked and nothing would have moved. The
 * last card says that in as many words rather than leaving a reader to discover
 * it. The one control that *is* real, the theme choice, is here because it is.
 *
 * The blocked-work badges go through `blockedReasonLabels` rather than being
 * mapped straight off `negativeSignals`, which is a matcher vocabulary and not a
 * list of sentences — see the note on that function for what it fixes.
 *
 * The theme row duplicates the topbar's toggle, deliberately. Both render the
 * same component reading the same store, so they cannot disagree, and the point
 * of a settings screen is that a setting can be found by looking for it rather
 * than by knowing it already lives in the chrome. The row is the labelled one:
 * it names the setting, which the topbar's switch has no space to do.
 */
export default function SettingsPage() {
  const profile = defaultServiceProfile;

  return (
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <Card>
          <CardHeader title="What you're looking for" subtitle={profile.name} />
          <CardBody className="space-y-4">
            <p className="text-[13px] leading-relaxed text-fg-soft">{profile.description}</p>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              <div>
                <dt className="text-[12px] text-fg-muted">Where you&rsquo;ll work</dt>
                <dd className="mt-0.5 text-[13px] text-fg">
                  {profile.locations.join(", ") || "No preference set"}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-fg-muted">Smallest job you take on</dt>
                <dd className="mt-0.5 text-[13px] tabular-nums text-fg">
                  {profile.minimumEngagement ?? "No minimum set"}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What you sell"
            subtitle="Every post is read for these. The more of them it actually asks for, the higher it scores."
          />
          <CardBody>
            <ul className="flex flex-wrap gap-1.5">
              {profile.capabilities.map((capability) => (
                <li key={capability}>
                  <Pill tone="brand">{capability}</Pill>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="What you won't take on"
            subtitle="A post asking for any of these is dropped before it is scored, so it never reaches your list at all."
          />
          <CardBody>
            <ul className="flex flex-wrap gap-1.5">
              {blockedReasonLabels(profile.negativeSignals).map((reason) => (
                <li key={reason}>
                  <Pill tone="outline">{reason}</Pill>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="space-y-3">
        <Card>
          <CardHeader
            title="How it looks"
            subtitle="Your choice is remembered on this device, not on the account."
          />
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-fg">Dark mode</span>
              <ThemeToggle />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Changing what you're looking for" />
          <CardBody className="space-y-3">
            <p className="text-[13px] leading-relaxed text-fg-soft">
              This profile is set when the app is set up, and editing it from here isn&rsquo;t built
              yet.
            </p>
            <p className="text-[13px] leading-relaxed text-fg-muted">
              Worth knowing before it is: a lead&rsquo;s score is measured once, when it is found,
              and kept as it was. Changing the profile would change what gets found from then on,
              but it would not re-score anything already in your list — so the numbers beside
              existing leads would still come from the profile that found them.
            </p>
            <Button asChild variant="secondary" size="sm">
              <Link href="/sources">See where leads come from</Link>
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
