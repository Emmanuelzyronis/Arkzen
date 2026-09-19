import { NextResponse } from "next/server";
import { getOpportunity, updateStatus } from "@/lib/data/repository";
import { readBody, readChoice, readText } from "@/lib/api";
import { requireUser } from "@/lib/api-auth";
import { statusLabel } from "@/lib/plain";
import type { OpportunityStatus } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: OpportunityStatus[] = ["NEW", "REVIEWING", "QUALIFIED", "ACTIVE", "WON", "LOST", "UNKNOWN"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const { id } = await params;
  const opportunity = await getOpportunity(session.userId, id);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  return NextResponse.json({ opportunity });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const { id } = await params;

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  const status = readChoice(
    body,
    "status",
    STATUSES.map((value) => ({ value, label: statusLabel(value) })),
    { required: true, label: "The stage" },
  );
  if (!status.ok) return status.response;

  const note = readText(body, "note", { max: 2000, label: "The note" });
  if (!note.ok) return note.response;

  const opportunity = await updateStatus(session.userId, id, status.value as OpportunityStatus, note.value);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  return NextResponse.json({ opportunity });
}
