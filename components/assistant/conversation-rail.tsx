import Link from "next/link";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { groupConversations, previewOf } from "@/lib/assistant";
import type { Conversation } from "@/lib/data/repository";
import { humanizeAge } from "@/lib/domain/text";
import { cn } from "@/lib/utils";

/**
 * The leads you have asked about, most recently spoken in first.
 *
 * A server component and deliberately not a client one: every row is a link and
 * nothing here holds state, so the only thing a client boundary would buy is a
 * `match`-style closure that cannot cross it anyway (`lib/groups.ts` has that
 * story). The rows are rendered on the server and arrive as plain markup.
 *
 * `activeId` is the *effective* selection, not the raw query parameter. When the
 * URL names a lead that has no conversation, the page falls back to the most
 * recent one and shows that — and the highlight has to follow what is actually
 * on screen, or the rail would point at one row while the thread beside it
 * belonged to another.
 */
export function ConversationRail({
  conversations,
  activeId,
}: {
  conversations: Conversation[];
  activeId: string | null;
}) {
  const groups = groupConversations(conversations);

  return (
    <Card>
      <CardHeader
        title="Conversations"
        subtitle="Every lead you have asked about, most recent first."
      />
      <CardBody className="space-y-4">
        {groups.map((group) => (
          <div key={group.label}>
            {/* Sentence case, not tracked-out capitals — the same as every other
                label in the product. */}
            <p className="px-1 pb-1.5 text-[12px] font-medium text-fg-muted">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((conversation) => {
                const active = conversation.opportunityId === activeId;
                const preview = previewOf(conversation.lastMessage);
                const said = `${conversation.messages} ${
                  conversation.messages === 1 ? "message" : "messages"
                }`;

                return (
                  <li key={conversation.opportunityId}>
                    <Link
                      href={`/assistant?opportunity=${encodeURIComponent(conversation.opportunityId)}`}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "block rounded-tile px-2.5 py-2 transition-colors",
                        active ? "bg-brand-soft" : "hover:bg-surface-3",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        {/* `flex-1` with `min-w-0` gives this span the column's
                            width so `truncate` clips at the column rather than at
                            the text; under a bare `flex` it would shrink to fit
                            and spill into the age beside it. */}
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                          {conversation.title}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-fg-muted">
                          {humanizeAge(conversation.lastAt)}
                        </span>
                      </div>
                      {/* The last thing said, or — when the last message carried
                          no prose at all, which a `--- DRAFT ---` rule alone can
                          produce — how much was said instead. A blank second line
                          would read as a conversation with nothing in it. */}
                      <p className="mt-0.5 truncate text-[12px] text-fg-muted">{preview || said}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
