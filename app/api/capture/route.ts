import { NextResponse } from "next/server";
import { acquireAll } from "@/lib/sources";
import { buildOpportunities } from "@/lib/domain/pipeline";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import type { ServiceProfile } from "@/lib/domain/types";
import {
  insertActivity,
  insertOpportunities,
  recordAcquisitionRun,
  recordSourceHealth,
} from "@/lib/data/repository";
import { getDriver } from "@/lib/data/driver";
import { readBody, readText } from "@/lib/api";
import { requireUser } from "@/lib/api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Plain-language capture: what the operator wants Arkzen to watch for. */
function profileFromIntent(text: string): ServiceProfile {
  const trimmed = text.trim();
  if (!trimmed) return defaultServiceProfile;
  const keywords = [
    ...new Set(
      trimmed
        .toLowerCase()
        .split(/[^a-z0-9+#.-]+/)
        .filter((word) => word.length > 3)
        .slice(0, 24),
    ),
  ];
  return {
    ...defaultServiceProfile,
    description: trimmed,
    keywords: keywords.length > 0 ? keywords : defaultServiceProfile.keywords,
  };
}

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session.ok) return session.response;

  const parsed = await readBody(request);
  const body = parsed.ok ? parsed.body : {};

  const intent = readText(body, "intent", { max: 2000, label: "What to watch for" });
  if (!intent.ok) return intent.response;

  const profile = profileFromIntent(intent.value ?? "");
  const startedAt = new Date().toISOString();
  const { signals, runs } = await acquireAll({ profile, limitPerSource: 25 });
  const result = buildOpportunities(signals, profile, new Date());
  // Exactly the rows that were stored, in the order they were stored. This used
  // to be `result.opportunities.slice(0, created)`, which assumed the first
  // `created` entries are the new ones — untrue the moment anything is already
  // stored, because duplicates are skipped part-way through the loop. The
  // "Captured live from …" activity then landed on a lead that had just been
  // found by someone else's run, and the response named the wrong records.
  const inserted = await insertOpportunities(session.userId, result.opportunities);
  const created = inserted.length;

  for (const opportunity of inserted) {
    if (opportunity.signal.dataKind === "live") {
      await insertActivity(session.userId, {
        opportunityId: opportunity.id,
        kind: "DISCOVERED",
        actor: "arkzen",
        summary: `Captured live from ${opportunity.signal.sourceName}`,
        detail: opportunity.matchReason,
      });
    }
  }

  await recordSourceHealth(
    session.userId,
    runs.map((run) => ({
      providerId: run.sourceId,
      available: run.status === "SUCCESS" || run.status === "PARTIAL_SUCCESS",
      detail: run.detail,
      checkedAt: new Date().toISOString(),
    })),
  );

  await recordAcquisitionRun(
    session.userId,
    {
      startedAt,
      completedAt: new Date().toISOString(),
      status: runs.every((run) => run.status === "SUCCESS") ? "SUCCESS" : "PARTIAL_SUCCESS",
      detail: intent.value
        ? `Capture run for: ${intent.value}`
        : "Capture run with the default watch profile.",
      observed: result.observed,
      kept: result.opportunities.length,
      rejected: result.rejected.length,
      duplicates: result.duplicates,
      created,
      sourceRuns: runs.map((run) => ({
        sourceId: run.sourceId,
        sourceName: run.sourceName,
        status: run.status,
        detail: run.detail,
        count: run.count,
      })),
    },
    await getDriver(),
  );

  return NextResponse.json(
    {
      created,
      observed: result.observed,
      kept: result.opportunities.length,
      rejected: result.rejected.map((entry) => ({
        title: entry.signal.title,
        reason: entry.reason,
        rule: entry.rule,
        source: entry.signal.sourceName,
      })),
      duplicates: result.duplicates,
      runs: runs.map((run) => ({
        sourceId: run.sourceId,
        sourceName: run.sourceName,
        status: run.status,
        detail: run.detail,
        count: run.count,
        durationMs: run.durationMs,
        live: run.live,
      })),
      opportunities: inserted.map((opportunity) => ({
        id: opportunity.id,
        title: opportunity.signal.title,
        score: opportunity.score,
        band: opportunity.band,
        source: opportunity.signal.sourceName,
        dataKind: opportunity.signal.dataKind,
      })),
    },
    { status: 201 },
  );
}
