import type { Conversation } from "@/lib/data/repository";

/**
 * The figures and groupings behind `/assistant`.
 *
 * The screen is mostly composition — the thread itself already exists as
 * `components/opportunities/partner-panel.tsx`, shared with the lead detail
 * page — so what lives here is the small amount of arithmetic the rail needs:
 * which conversation the screen opens on, how a stored message becomes one line
 * of preview, and how conversations are grouped by when they were last spoken
 * in. Kept out of the page so it can be tested without a browser.
 */

/**
 * How much of a message the rail shows before it is cut.
 *
 * The rail is a narrow column, so this is roughly what fits on one line there;
 * the row also has `truncate` on it, which is the real clip. This bound exists
 * so the DOM carries a short string rather than a whole answer.
 */
const PREVIEW_CHARS = 120;

/**
 * A stored message, as one line the rail can show.
 *
 * Partner answers are stored with their structure flattened into text — a
 * headline, a blank line, the recommendation, and sometimes a `--- DRAFT ---`
 * section holding the suggested message. The rail has room for one line, so
 * this takes the first line with something in it.
 *
 * The `--- DRAFT ---` marker is skipped rather than shown. It is a separator
 * written for a reader scrolling the whole message; as a preview it would
 * appear above every draft and say nothing about which conversation this is.
 * The draft *body* is not skipped — only the rule itself — so a conversation
 * whose last message carries nothing but a draft still previews as the draft.
 *
 * Returns `""` when there is nothing to show. An empty line is then not
 * rendered at all, which is better than a row reading "No text".
 */
export function previewOf(content: string): string {
  const line = content
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !/^-+\s*DRAFT\s*-+$/i.test(entry));

  if (!line) return "";
  return line.length > PREVIEW_CHARS ? `${line.slice(0, PREVIEW_CHARS - 1).trimEnd()}…` : line;
}

/**
 * Which conversation the screen opens on.
 *
 * `?opportunity=<id>` wins when it names one that exists. When it does not — a
 * stale link, a lead whose conversation was deleted, or no query at all — the
 * screen falls back to the most recent conversation rather than to an empty
 * panel. `listConversations` sorts newest first, so that is `[0]`.
 *
 * Falling back rather than erroring is deliberate: an unknown id in a URL is
 * an ordinary thing to arrive with, and a screen that answered it with "not
 * found" would be refusing to show a reader the one conversation they can
 * actually have.
 */
export function selectedConversation(
  conversations: Conversation[],
  requested?: string,
): Conversation | null {
  if (conversations.length === 0) return null;
  return conversations.find((entry) => entry.opportunityId === requested) ?? conversations[0];
}

export interface ConversationGroup {
  label: string;
  items: Conversation[];
}

/**
 * Conversations bucketed by how long ago they were last spoken in, recent
 * first, with empty buckets dropped.
 *
 * Three buckets in the shape of the reference's rail — and **measured in
 * elapsed time, not calendar days.** The reference labels its buckets "Today",
 * "Yesterday" and "Last 7 days"; the first two are claims about the reader's
 * calendar, and this runs on the server, so the day boundary it computed would
 * be the server's. On a deployment that is UTC, a conversation half an hour old
 * for a reader in UTC+2 falls on the previous UTC day and would be filed under
 * "Yesterday". Elapsed hours are the same number wherever the reader is — which
 * is also why every age in this product already reads as a duration ("4h ago")
 * rather than as a date. The labels here say what they actually measure.
 *
 * The thresholds are whole days, so a bucket's label is true of everything in
 * it: nothing under "Last 24 hours" is older than a day.
 */
export function groupConversations(
  conversations: Conversation[],
  now: Date = new Date(),
): ConversationGroup[] {
  const buckets: ConversationGroup[] = [
    { label: "Last 24 hours", items: [] },
    { label: "Last week", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const conversation of conversations) {
    const hours = (now.getTime() - new Date(conversation.lastAt).getTime()) / 3_600_000;
    // A timestamp in the future is not a fourth bucket — it is a clock that
    // disagrees with the server. It goes in with the most recent rather than
    // being dropped, because a conversation that exists must appear somewhere.
    if (hours < 24) buckets[0].items.push(conversation);
    else if (hours < 24 * 7) buckets[1].items.push(conversation);
    else buckets[2].items.push(conversation);
  }

  return buckets.filter((bucket) => bucket.items.length > 0);
}
