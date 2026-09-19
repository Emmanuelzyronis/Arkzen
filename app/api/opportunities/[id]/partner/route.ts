import { NextResponse } from "next/server";
import { getOpportunity, insertActivity, insertPartnerMessage } from "@/lib/data/repository";
import { readBody, readChoice, readText } from "@/lib/api";
import { requireUser } from "@/lib/api-auth";
import { askPartner, type PartnerIntent } from "@/lib/domain/partner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INTENTS: Array<{ value: PartnerIntent; label: string }> = [
  { value: "why", label: "Why this one" },
  { value: "opening-message", label: "An opening message" },
  { value: "objections", label: "Likely objections" },
  { value: "next-action", label: "The next action" },
  { value: "interpret-reply", label: "A reply from them" },
  { value: "ask", label: "A question" },
];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const { id } = await params;
  const opportunity = await getOpportunity(session.userId, id);
  if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  const intent = readChoice(body, "intent", INTENTS, { fallback: "why", label: "What to ask" });
  if (!intent.ok) return intent.response;

  const question = readText(body, "question", { max: 1200, label: "The question" });
  if (!question.ok) return question.response;

  const prospectReply = readText(body, "prospectReply", { max: 6000, label: "Their reply" });
  if (!prospectReply.ok) return prospectReply.response;

  if (intent.value === "ask" && !question.value) {
    return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  }
  if (intent.value === "interpret-reply" && !prospectReply.value) {
    return NextResponse.json({ error: "Paste their reply first." }, { status: 400 });
  }

  if (question.value || prospectReply.value) {
    await insertPartnerMessage(session.userId, {
      opportunityId: id,
      role: "operator",
      content: prospectReply.value
        ? `Prospect reply pasted:\n${prospectReply.value}`
        : (question.value as string),
      grounding: ["Operator input"],
      provider: "operator",
    });
  }

  const response = await askPartner(opportunity, {
    intent: intent.value as PartnerIntent,
    question: question.value ?? undefined,
    prospectReply: prospectReply.value ?? undefined,
  });

  const stored = await insertPartnerMessage(session.userId, {
    opportunityId: id,
    role: "partner",
    content: `${response.headline}\n\n${response.recommendation}${
      response.suggestedMessage ? `\n\n--- DRAFT ---\n${response.suggestedMessage}` : ""
    }`,
    grounding: response.grounding,
    provider: response.provider,
    payload: response,
  });

  await insertActivity(session.userId, {
    opportunityId: id,
    kind: "AI_RECOMMENDATION",
    actor: "arkzen",
    summary: response.headline,
    detail: response.recommendation,
    meta: { intent: intent.value, provider: response.provider, mode: response.mode, messageId: stored.id },
  });

  return NextResponse.json({ response, message: stored }, { status: 201 });
}
