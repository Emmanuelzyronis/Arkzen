import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { readBody, readText } from "@/lib/api";
import {
  listAssistantMessages,
  insertAssistantMessage,
  listOpportunities,
  getServiceProfile,
} from "@/lib/data/repository";
import { completeChat } from "@/lib/ai/provider";
import { isWorthPursuing, isInProgress } from "@/lib/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function buildSystemPrompt(
  profile: { name: string; description: string; capabilities: string[] } | null,
  pipeline: {
    total: number;
    worthPursuing: number;
    inProgress: number;
    won: number;
    topLeads: Array<{ title: string; score: number; status: string; sourceName: string }>;
  },
): string {
  const profileSection = profile
    ? `## The operator's profile\n${profile.name}\n${profile.description}\nCapabilities: ${profile.capabilities.join(", ")}`
    : "## The operator's profile\nNot yet configured.";

  const topLeadLines =
    pipeline.topLeads.length > 0
      ? pipeline.topLeads
          .map((l, i) => `${i + 1}. "${l.title}" — score ${l.score}, ${l.status}, via ${l.sourceName}`)
          .join("\n")
      : "None yet.";

  return `You are the Arkzen deal assistant. Arkzen is a lead-gen CRM that finds people publicly asking for work the operator can do, and helps them turn those signals into clients.

${profileSection}

## Their current pipeline
- Total leads: ${pipeline.total}
- Worth pursuing: ${pipeline.worthPursuing}
- In progress: ${pipeline.inProgress}
- Won: ${pipeline.won}

Top leads by score:
${topLeadLines}

## How to help
Answer questions about the pipeline, specific leads, outreach strategy, pricing, objections, or anything about winning clients. Be specific and grounded in the operator's real data. Keep answers concise and actionable — two to four short paragraphs at most. You remember the full conversation history shown to you.`;
}

const FALLBACK_REPLIES = [
  "I don't have an AI provider connected right now. Once one is configured in Settings, I can answer questions about your pipeline, suggest outreach approaches, or help you think through specific leads.",
  "No AI provider is configured yet — check your environment variables for OPENAI_API_KEY or AZURE_OPENAI_API_KEY. When that's set up, I can help with your pipeline.",
];

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const parsed = await readBody(request);
  if (!parsed.ok) return parsed.response;

  const message = readText(parsed.body, "message", { max: 2000, label: "Message" });
  if (!message.ok) return message.response;
  if (!message.value) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }

  const [history, items, profile] = await Promise.all([
    listAssistantMessages(session.userId, 30),
    listOpportunities(session.userId),
    getServiceProfile(session.userId),
  ]);

  const topLeads = [...items]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => ({ title: item.title, score: item.score, status: item.status, sourceName: item.sourceName }));

  const pipeline = {
    total: items.length,
    worthPursuing: items.filter(isWorthPursuing).length,
    inProgress: items.filter(isInProgress).length,
    won: items.filter((item) => item.outcome === "WON").length,
    topLeads,
  };

  await insertAssistantMessage(session.userId, { role: "user", content: message.value });

  const chatHistory = history.map((m) => ({ role: m.role, content: m.content }));

  const result = await completeChat({
    system: buildSystemPrompt(profile, pipeline),
    messages: [...chatHistory, { role: "user" as const, content: message.value }],
  });

  const replyContent = result.ok
    ? result.text
    : FALLBACK_REPLIES[Math.floor(Math.random() * FALLBACK_REPLIES.length)];

  const stored = await insertAssistantMessage(session.userId, { role: "assistant", content: replyContent });

  return NextResponse.json({ reply: replyContent, message: stored }, { status: 201 });
}
