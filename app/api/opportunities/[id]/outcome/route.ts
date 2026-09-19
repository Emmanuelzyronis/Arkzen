import { NextResponse } from "next/server";
import { recordOutcome } from "@/lib/data/repository";
import { readBody, readChoice, readText } from "@/lib/api";
import { requireUser } from "@/lib/api-auth";
import { outcomeLabel } from "@/lib/plain";
import type { OutcomeKind } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const { id } = await params;

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  const outcome = readChoice(
    body,
    "outcome",
    OUTCOMES.map((value) => ({ value, label: outcomeLabel(value) })),
    { required: true, label: "The outcome" },
  );
  if (!outcome.ok) return outcome.response;

  const note = readText(body, "note", { max: 2000, label: "The note" });
  if (!note.ok) return note.response;

  const opportunity = await recordOutcome(session.userId, id, outcome.value as OutcomeKind, note.value);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  return NextResponse.json({ opportunity });
}
