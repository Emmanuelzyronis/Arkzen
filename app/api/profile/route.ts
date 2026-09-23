import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { getServiceProfile, upsertServiceProfile } from "@/lib/data/repository";

export async function GET() {
  const session = await requireUser();
  if (!session.ok) return session.response;
  const profile = await getServiceProfile(session.userId);
  if (!profile) return NextResponse.json({ profile: null }, { status: 200 });
  return NextResponse.json({ profile });
}

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    capabilities?: string[];
    keywords?: string[];
    negativeSignals?: string[];
    locations?: string[];
    minimumEngagement?: string;
    mode?: string;
  };

  const name = (body.name ?? "").trim();
  const description = (body.description ?? "").trim();

  if (!name || !description) {
    return NextResponse.json({ error: "name and description are required" }, { status: 400 });
  }

  const mode: "lead-gen" = "lead-gen";

  const profile = await upsertServiceProfile(session.userId, {
    name,
    description,
    capabilities: Array.isArray(body.capabilities) ? body.capabilities.filter(Boolean) : [],
    keywords: Array.isArray(body.keywords) ? body.keywords.filter(Boolean) : [],
    negativeSignals: Array.isArray(body.negativeSignals) ? body.negativeSignals.filter(Boolean) : [],
    locations: Array.isArray(body.locations) ? body.locations.filter(Boolean) : [],
    minimumEngagement: body.minimumEngagement?.trim() || undefined,
    mode,
  });

  return NextResponse.json({ profile }, { status: 201 });
}
