import { NextResponse } from "next/server";
import { decidePartnerMessage, getOpportunity, insertActivity } from "@/lib/data/repository";
import { readBody, readChoice, readText } from "@/lib/api";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS = [
  { value: "accepted", label: "Used it" },
  { value: "edited", label: "Edited it" },
  { value: "rejected", label: "Didn't use it" },
] as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const { id } = await params;
  const opportunity = await getOpportunity(session.userId, id);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  const messageId = readText(body, "messageId", { required: true, label: "The draft" });
  if (!messageId.ok) return messageId.response;

  const decision = readChoice(body, "decision", DECISIONS, { required: true, label: "The decision" });
  if (!decision.ok) return decision.response;

  const note = readText(body, "note", { max: 2000, label: "The note" });
  if (!note.ok) return note.response;

  // 404, not 201. The message is matched on its id *and* this opportunity, so a
  // draft that belongs to another lead — or to none — matches nothing. Before,
  // this reported success while silently rewriting a different lead's message.
  const matched = await decidePartnerMessage(
    session.userId,
    id,
    messageId.value as string,
    decision.value as "accepted" | "edited" | "rejected",
    note.value,
  );
  if (!matched) {
    return NextResponse.json({ error: "That draft is no longer on this lead." }, { status: 404 });
  }

  await insertActivity(session.userId, {
    opportunityId: id,
    // `ACTION`, not `MESSAGE`: this records a decision about a draft, and the
    // timeline renders `MESSAGE` as "Message sent". Nothing was sent — saying it
    // was puts a false claim in the permanent record of the lead.
    kind: "ACTION",
    actor: "operator",
    summary:
      decision.value === "accepted"
        ? "Accepted the AI recommendation"
        : decision.value === "edited"
          ? "Edited and approved the AI draft"
          : "Rejected the AI recommendation",
    detail: note.value,
    meta: { messageId: messageId.value, decision: decision.value },
  });

  return NextResponse.json({ ok: true, decision: decision.value }, { status: 201 });
}
