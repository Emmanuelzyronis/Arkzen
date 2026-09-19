import { NextResponse } from "next/server";
import { getOpportunity, insertActivity } from "@/lib/data/repository";
import { readBody, readChoice, readText } from "@/lib/api";
import { requireUser } from "@/lib/api-auth";
import { activityLabel } from "@/lib/plain";
import type { Activity } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: Activity["kind"][] = ["NOTE", "ACTION", "MESSAGE", "REPLY", "AI_RECOMMENDATION"];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const { id } = await params;
  const opportunity = await getOpportunity(session.userId, id);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  const kind = readChoice(
    body,
    "kind",
    KINDS.map((value) => ({ value, label: activityLabel(value) })),
    { fallback: "NOTE", label: "Activity type" },
  );
  if (!kind.ok) return kind.response;

  const summary = readText(body, "summary", { required: true, max: 2000, label: "The note" });
  if (!summary.ok) return summary.response;

  const detail = readText(body, "detail", { max: 4000, label: "The detail" });
  if (!detail.ok) return detail.response;

  const activity = await insertActivity(session.userId, {
    opportunityId: id,
    kind: kind.value as Activity["kind"],
    actor: body.actor === "prospect" ? "prospect" : "operator",
    summary: summary.value as string,
    detail: detail.value,
  });

  return NextResponse.json({ activity }, { status: 201 });
}
