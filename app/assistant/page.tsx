import Link from "next/link";

import { ConversationRail } from "@/components/assistant/conversation-rail";
import { PartnerPanel } from "@/components/opportunities/partner-panel";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { selectedConversation } from "@/lib/assistant";
import { requirePageUser } from "@/lib/api-auth";
import {
  listConversations,
  listOpportunities,
  listPartnerMessages,
} from "@/lib/data/repository";
import { categoryGroups, groupOptions } from "@/lib/groups";
import { count } from "@/lib/plain";
import { periodWindow, resolveRange } from "@/lib/window";

export const dynamic = "force-dynamic";

/**
 * Assistant — the reference's "AI Assistant" panel, as a screen of its own.
 *
 * Two things are worth knowing about how this is assembled.
 *
 * **The thread already existed.** `components/opportunities/partner-panel.tsx`
 * is the whole conversation UI — bubbles, the draft card with its two decisions,
 * the suggestion chips, the composer — and it is shared with the lead detail
 * page rather than copied. What this screen adds is the rail beside it and a
 * reason for the panel to exist away from a lead: a lead detail page can only
 * ever show one thread, and the question "which leads have I talked about?" had
 * no screen.
 *
 * **The figures beside the thread are the app's, not the assistant's.** The
 * reference draws a breakdown table *inside* an answer, as something the model
 * produced. There is no tool-calling here and `PartnerResponse` carries no
 * tabular output, so the model cannot produce one. The card is therefore the
 * app's own count of the period's leads by kind of work, and its subtitle says
 * so. Keeping the reference's element while telling the truth about where the
 * numbers came from is the whole point of this card existing at all.
 */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ opportunity?: string; range?: string; from?: string; to?: string }>;
}) {
  const { opportunity, range, from, to } = await searchParams;
  const ownerId = await requirePageUser();
  const [conversations, items] = await Promise.all([
    listConversations(ownerId),
    listOpportunities(ownerId),
  ]);

  const selected = selectedConversation(conversations, opportunity);
  // Asked for only once the lead is known — `listPartnerMessages` takes one id,
  // and there is nothing to ask for when no conversation exists.
  const thread = selected ? await listPartnerMessages(ownerId, selected.opportunityId) : [];

  // The same window as every other screen, so the picker in the topbar governs
  // this card too. A card that ignored the control sitting above it would be
  // reporting a different period from the four screens either side of it, and
  // the reader has no way to see that from the page.
  const now = new Date();
  const earliest = items.length
    ? new Date(Math.min(...items.map((item) => new Date(item.publishedAt).getTime())))
    : now;
  const { current } = periodWindow(
    items,
    (item) => item.publishedAt,
    resolveRange({ range, from, to }, earliest, now),
  );
  const categories = groupOptions(categoryGroups(current));
  const largest = categories[0]?.total ?? 0;

  return (
    // `grid-cols-1` is load-bearing below `xl`. A bare `grid` sizes its
    // implicit column with a *min* track function of `auto`, which is the
    // content's min-content — and the rail's preview is `truncate`, i.e.
    // `white-space: nowrap`, whose min-content is the entire preview string.
    // That propagated 538 → 558 → 598 → 612px and scrolled the whole page
    // sideways at a 390px viewport. `grid-cols-1` compiles to
    // `repeat(1, minmax(0, 1fr))`, whose zero minimum stops it. The `xl`
    // template has always been safe for the same reason.
    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)]">
      <div className="space-y-3">
        {/* The rail is deliberately *not* windowed, unlike the card below it.
            A conversation is dated by when it was last spoken in, not by when
            the lead was posted, so putting it behind the period picker would
            make talking to someone remove them from the list at the end of the
            month. The card's subtitle names the period for exactly this reason:
            the two panels measure different things and the reader should be
            able to tell which is which. */}
        {conversations.length > 0 ? (
          <ConversationRail
            conversations={conversations}
            activeId={selected?.opportunityId ?? null}
          />
        ) : null}

        <Card>
          <CardHeader
            title="What Arkzen knows"
            subtitle="The period's leads by kind of work, from the app's own figures. This is not part of the assistant's answer."
          />
          <CardBody className="space-y-2.5">
            {categories.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-fg-muted">
                Nothing was posted in this period, so there is nothing to break down.
              </p>
            ) : (
              <>
                <ul className="space-y-2">
                  {categories.map((category) => (
                    <li key={category.key}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-fg-soft">
                          {category.label}
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums text-fg-muted">
                          {count(category.total)}
                        </span>
                      </div>
                      {/* A share bar, so the ranking reads at a glance rather
                          than by comparing numbers down a column. */}
                      <span aria-hidden="true" className="mt-1 block h-1 rounded-full bg-surface-3">
                        <span
                          className="block h-full rounded-full bg-brand/70"
                          style={{
                            width: `${largest > 0 ? Math.round((category.total / largest) * 100) : 0}%`,
                          }}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line pt-2.5">
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/categories">See every category</Link>
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0">
        {selected ? (
          <PartnerPanel
            opportunityId={selected.opportunityId}
            thread={thread}
            title={selected.title}
            subtitle="Answers are built from what was actually posted, not from general advice."
          />
        ) : (
          <Card>
            <EmptyState
              title="No conversations yet"
              body="Open a lead and ask about it — what they are really after, whether you have done this before. The conversation is saved with the lead and appears here."
              action={
                <Button asChild variant="primary" size="sm">
                  <Link href="/opportunities">Go to All opportunities</Link>
                </Button>
              }
            />
          </Card>
        )}
      </div>
    </div>
  );
}
