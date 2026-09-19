"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/input";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import type { PartnerMessage } from "@/lib/domain/types";
import { humanizeAge } from "@/lib/domain/text";
import { providerLabel } from "@/lib/plain";

/**
 * The conversation about this lead, and the box you ask in.
 *
 * Two things this deliberately does not do.
 *
 * It does not offer an edit box for the draft. `payload` is a frozen snapshot
 * and nothing re-writes `suggestedMessage`, so an editor whose contents are
 * discarded would end with the activity log claiming "Edited and approved"
 * about text the app never saved. The draft is offered to be *copied* — you
 * take it somewhere else and send it from there — and the only two decisions
 * recorded are that you used it or you didn't, which is what actually happened.
 *
 * It does not branch the "built-in reasoning" notice on `mode`. When a provider
 * is configured but unreachable, `partner.ts` sets `providerNote` and leaves
 * `mode` at `"deterministic"`; when no provider is configured at all,
 * `providerNote` is absent. Only `providerNote` distinguishes the two.
 */

const PROMPTS: { intent: string; label: string }[] = [
  { intent: "why", label: "Why this one?" },
  { intent: "opening-message", label: "Draft an opener" },
  { intent: "objections", label: "What might they push back on?" },
  { intent: "next-action", label: "What should I do next?" },
];

export function PartnerPanel({
  opportunityId,
  thread,
  title = "Ask about this lead",
  subtitle = "Answers are built from what was actually posted, not from general advice.",
}: {
  opportunityId: string;
  thread: PartnerMessage[];
  /**
   * The card's heading. Defaults to the lead detail page's wording, which is
   * right there because the page above it has already named the lead.
   *
   * `/assistant` passes its own: it shows one thread out of many on a screen
   * whose title is not a lead, so "this lead" would have no referent and the
   * heading has to carry the name instead.
   */
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [deciding, setDeciding] = useState<string | null>(null);
  const thinking = pending?.startsWith("ask-") ?? false;

  async function post(path: string, body: unknown, key: string, done: string) {
    setPending(key);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: string } | null;
        notify(problem?.error ?? "That did not go through. Try again.", "error");
        return false;
      }
      notify(done);
      router.refresh();
      return true;
    } catch {
      notify("Could not reach the server. Check your connection and try again.", "error");
      return false;
    } finally {
      setPending(null);
    }
  }

  async function ask(intent: string, asked?: string) {
    const ok = await post(
      `/api/opportunities/${opportunityId}/partner`,
      { intent, question: asked },
      `ask-${intent}`,
      "Answer added below",
    );
    if (ok && asked) setQuestion("");
  }

  async function decide(messageId: string, decision: "accepted" | "rejected") {
    setDeciding(messageId);
    await post(
      `/api/opportunities/${opportunityId}/partner/decision`,
      { messageId, decision },
      `decide-${messageId}`,
      decision === "accepted" ? "Logged as used" : "Logged as not used",
    );
    setDeciding(null);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader title={title} subtitle={subtitle} />
        <CardBody className="space-y-4">
          {thread.length === 0 ? (
            <p className="rounded-tile bg-surface-2 px-3 py-3 text-[13px] leading-relaxed text-fg-muted">
              Nothing asked yet. Pick a question below and the answer appears here, saved with the
              lead.
            </p>
          ) : (
            <ol className="space-y-3">
              {thread.map((message) =>
                message.role === "operator" ? (
                  <li key={message.id} className="flex justify-end">
                    <p className="max-w-[85%] whitespace-pre-wrap rounded-card rounded-br-tile bg-brand-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-fg">
                      {message.content}
                    </p>
                  </li>
                ) : (
                  <PartnerBubble
                    key={message.id}
                    message={message}
                    busy={deciding === message.id || pending !== null}
                    onDecide={(decision) => decide(message.id, decision)}
                    onCopy={() => notify("Message copied")}
                  />
                ),
              )}
              {/* The reference's "thinking" line, shown where the answer will
                  land rather than only on the chip that was clicked. Gated on
                  the *ask* keys: `pending` also covers the two draft decisions,
                  and a "Thinking…" bubble appearing because someone clicked
                  "Not this one" would be describing work nobody asked for. */}
              {thinking ? (
                <li className="max-w-[92%]">
                  <p
                    role="status"
                    className="inline-flex items-center gap-2 rounded-card rounded-bl-tile border border-line bg-surface-2 px-3.5 py-3 text-[13px] text-fg-muted"
                  >
                    <Sparkles aria-hidden="true" className="size-3.5 text-brand" />
                    Thinking…
                  </p>
                </li>
              ) : null}
            </ol>
          )}

          <div className="space-y-2 border-t border-line pt-4">
            <div className="flex flex-wrap gap-2">
              {PROMPTS.map((prompt) => (
                <Button
                  key={prompt.intent}
                  type="button"
                  variant="quiet"
                  size="sm"
                  disabled={pending !== null}
                  onClick={() => ask(prompt.intent)}
                >
                  <Sparkles aria-hidden="true" className="size-3.5 text-brand" />
                  {pending === `ask-${prompt.intent}` ? "Thinking…" : prompt.label}
                </Button>
              ))}
            </div>

            <Textarea
              aria-label="Ask your own question about this lead"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask anything about this post — what they're really after, whether you've done this before…"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Say why the paperclip is missing rather than drawing one that
                  does nothing: there is no upload route and no field on the
                  message to hold a file. */}
              <p className="text-[12px] text-fg-muted">
                Answers come from the post and your profile. Attachments aren&apos;t supported yet.
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending !== null || question.trim().length === 0}
                onClick={() => ask("ask", question.trim())}
              >
                {pending === "ask-ask" ? "Thinking…" : "Ask"}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </TooltipProvider>
  );
}

function PartnerBubble({
  message,
  busy,
  onDecide,
  onCopy,
}: {
  message: PartnerMessage;
  busy: boolean;
  onDecide: (decision: "accepted" | "rejected") => void;
  onCopy: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const payload = message.payload;
  const draft = payload?.suggestedMessage ?? null;
  const decided = message.decision ?? null;

  return (
    <li className="max-w-[92%] space-y-2">
      <div className="rounded-card rounded-bl-tile border border-line bg-surface-2 px-3.5 py-3">
        {payload ? (
          <>
            <p className="text-[13px] font-semibold text-fg">{payload.headline}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-soft">{payload.recommendation}</p>

            {payload.rationale.length > 0 ? (
              <ul className="mt-2.5 space-y-1">
                {payload.rationale.map((line) => (
                  <li key={line} className="flex gap-2 text-[12px] leading-relaxed text-fg-soft">
                    <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-fg-muted" />
                    {line}
                  </li>
                ))}
              </ul>
            ) : null}

            {payload.objections.length > 0 ? (
              <dl className="mt-3 space-y-2">
                {payload.objections.map((objection) => (
                  <div key={objection.objection}>
                    <dt className="flex flex-wrap items-center gap-1.5 text-[12px] font-medium text-fg">
                      {objection.objection}
                      {/* The provider's `likelihood` is an unvalidated string, so
                          the tone is mapped with a fallback rather than an
                          exhaustive switch that would hit a default anyway. */}
                      <Pill tone={objection.likelihood === "likely" ? "down" : "neutral"}>
                        {objection.likelihood === "likely" ? "Likely" : "Maybe"}
                      </Pill>
                    </dt>
                    <dd className="mt-0.5 text-[12px] leading-relaxed text-fg-muted">
                      {objection.response}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-fg-soft">
            {message.content}
          </p>
        )}

        {/* Say the model was unreachable only when it was. Rebranching this on
            `mode` would tell every user on the built-in path that something
            failed.

            The notice does not print `providerNote` itself: that field carries
            the provider's raw failure string, which is a stack trace in
            miniature. The fact worth telling is the same either way, and this is
            it. */}
        {payload?.providerNote ? (
          <p className="mt-3 rounded-tile bg-warn-bg px-2.5 py-2 text-[12px] leading-relaxed text-fg-soft">
            Couldn&apos;t reach your AI provider just now, so this answer was built from the
            lead&apos;s own details instead.
          </p>
        ) : null}
      </div>

      {draft ? (
        <div className="rounded-card border border-line bg-surface p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-fg-muted">Suggested message</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Copy the suggested message"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(draft);
                  setCopied(true);
                  onCopy();
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard access can be refused. Selecting the text is
                  // still possible, so say nothing rather than claim success.
                }
              }}
            >
              {copied ? (
                <Check aria-hidden="true" className="size-3.5 text-brand" />
              ) : (
                <Copy aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{draft}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
            {decided ? (
              <p className="text-[12px] text-fg-muted">
                {decided === "accepted" ? "Logged as used." : "Logged as not used."}
              </p>
            ) : (
              <>
                <Tooltip label="I'll send this">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDecide("accepted")}
                  >
                    <ThumbsUp aria-hidden="true" className="size-3.5" />
                    Use this
                  </Button>
                </Tooltip>
                <Tooltip label="Not the right angle">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onDecide("rejected")}
                  >
                    <ThumbsDown aria-hidden="true" className="size-3.5" />
                    Not this one
                  </Button>
                </Tooltip>
                <span className="text-[12px] text-fg-muted">
                  Copy it and send it wherever you talk to them.
                </span>
              </>
            )}
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-fg-muted">
        {providerLabel(message.provider)} · {humanizeAge(message.createdAt)}
      </p>
    </li>
  );
}
