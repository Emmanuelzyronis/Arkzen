"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { OpportunityStatus, OutcomeKind } from "@/lib/domain/types";
import { outcomeLabel, statusLabel } from "@/lib/plain";

/**
 * The only part of an opportunity that can still change.
 *
 * Everything else on this screen — the score, the fit checks, the strategy — is
 * a snapshot written when the post was found (`repository.ts` stores the scored
 * payload once at capture). Status, outcome and the note are the live fields, so
 * they are the only things this card offers. A control here that implied it
 * re-scored anything would be lying about what the app can do.
 *
 * Every write ends in `router.refresh()` rather than merging the response body:
 * `POST .../activities` returns only the activity while `PATCH` and `/outcome`
 * return the whole opportunity, so trusting the body would mean three different
 * merge strategies for one screen.
 */

const STATUSES: OpportunityStatus[] = ["NEW", "REVIEWING", "QUALIFIED", "ACTIVE", "WON", "LOST"];
const OUTCOMES: OutcomeKind[] = [
  "NO_RESPONSE",
  "REPLIED",
  "CONVERSATION",
  "MEETING",
  "PROPOSAL",
  "WON",
  "LOST",
  "DISQUALIFIED",
  "UNREACHABLE",
];

const SELECT =
  "w-full rounded-tile border border-line bg-surface px-3 h-9 text-[13px] text-fg transition-colors focus:border-brand focus:outline-none";

export function RecordOutcome({
  opportunityId,
  status,
  outcome,
  outcomeNote,
}: {
  opportunityId: string;
  status: OpportunityStatus;
  outcome: OutcomeKind | null;
  outcomeNote: string | null;
}) {
  const router = useRouter();
  const { notify } = useToast();

  const [nextStatus, setNextStatus] = useState<OpportunityStatus>(status);
  const [nextOutcome, setNextOutcome] = useState<OutcomeKind | "">(outcome ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"status" | "outcome" | "note" | null>(null);

  async function send(
    path: string,
    body: unknown,
    what: "status" | "outcome" | "note",
    done: string,
    method: "POST" | "PATCH" = "POST",
  ) {
    setPending(what);
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        // The server's message is written for a person to read. Falling back to
        // a status code would be the only truly unreadable outcome here.
        const problem = (await response.json().catch(() => null)) as { error?: string } | null;
        notify(problem?.error ?? "That did not save. Try again.", "error");
        return;
      }
      notify(done);
      router.refresh();
    } catch {
      notify("Could not reach the server. Check your connection and try again.", "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Record what happened"
        subtitle="Kept on the lead, so the next person reading it knows where things stand."
      />
      <CardBody className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="status" label="Stage" hint="Where this sits in your process.">
            <div className="flex gap-2">
              <select
                id="status"
                className={SELECT}
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value as OpportunityStatus)}
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={pending !== null || nextStatus === status}
                onClick={() =>
                  send(
                    `/api/opportunities/${opportunityId}`,
                    { status: nextStatus },
                    "status",
                    `Stage set to ${statusLabel(nextStatus).toLowerCase()}`,
                    // The stage lives on the opportunity itself, so it is a
                    // `PATCH` on the record; the other two are new rows. Sending
                    // this as a POST returns 405 and saves nothing.
                    "PATCH",
                  )
                }
              >
                {pending === "status" ? "Saving…" : "Save"}
              </Button>
            </div>
          </Field>

          <Field
            id="outcome"
            label="How it went"
            hint={outcome ? `Last recorded: ${outcomeLabel(outcome)}.` : "Nothing recorded yet."}
          >
            <div className="flex gap-2">
              <select
                id="outcome"
                className={SELECT}
                value={nextOutcome}
                onChange={(event) => setNextOutcome(event.target.value as OutcomeKind | "")}
              >
                <option value="">Not recorded</option>
                {OUTCOMES.map((value) => (
                  <option key={value} value={value}>
                    {outcomeLabel(value)}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={pending !== null || nextOutcome === "" || nextOutcome === outcome}
                onClick={() =>
                  send(
                    `/api/opportunities/${opportunityId}/outcome`,
                    { outcome: nextOutcome },
                    "outcome",
                    `Recorded: ${nextOutcome === "" ? "" : outcomeLabel(nextOutcome).toLowerCase()}`,
                  )
                }
              >
                {pending === "outcome" ? "Saving…" : "Save"}
              </Button>
            </div>
          </Field>
        </div>

        {outcomeNote ? (
          <p className="rounded-tile bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-fg-muted">
            {outcomeNote}
          </p>
        ) : null}

        <Field
          id="note"
          label="Add a note"
          hint="Anything worth remembering: who you spoke to, what they said, what you agreed."
        >
          <Textarea
            id="note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Called on Tuesday, they want a quote for the first phase…"
          />
        </Field>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending !== null || note.trim().length === 0}
            onClick={async () => {
              await send(
                `/api/opportunities/${opportunityId}/activities`,
                { kind: "NOTE", summary: note.trim(), actor: "operator" },
                "note",
                "Note added",
              );
              setNote("");
            }}
          >
            {pending === "note" ? "Saving…" : "Add note"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
