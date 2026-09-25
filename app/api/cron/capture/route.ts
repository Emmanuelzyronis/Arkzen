import { NextResponse } from "next/server";
import { acquireAll } from "@/lib/sources";
import { buildOpportunities } from "@/lib/domain/pipeline";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import type { ServiceProfile } from "@/lib/domain/types";
import {
  getServiceProfile,
  insertActivity,
  insertOpportunities,
  insertRejectedSignals,
  listAllOwnerIds,
  recordAcquisitionRun,
  recordSourceHealth,
} from "@/lib/data/repository";
import { getDriver } from "@/lib/data/driver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Vercel passes the cron secret in the Authorization header.
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownerIds = await listAllOwnerIds();
  const results: Array<{ ownerId: string; created: number; rejected: number }> = [];

  for (const ownerId of ownerIds) {
    const savedProfile = await getServiceProfile(ownerId);
    const profile: ServiceProfile = savedProfile ?? defaultServiceProfile;
    const startedAt = new Date().toISOString();

    const { signals, runs } = await acquireAll({ profile, limitPerSource: 25 });
    const result = buildOpportunities(signals, profile, new Date());

    const inserted = await insertOpportunities(ownerId, result.opportunities);
    await insertRejectedSignals(ownerId, result.rejected);

    for (const opportunity of inserted) {
      if (opportunity.signal.dataKind === "live") {
        await insertActivity(ownerId, {
          opportunityId: opportunity.id,
          kind: "DISCOVERED",
          actor: "arkzen",
          summary: `Captured live from ${opportunity.signal.sourceName}`,
          detail: opportunity.matchReason,
        });
      }
    }

    await recordSourceHealth(
      ownerId,
      runs.map((run) => ({
        providerId: run.sourceId,
        available: run.status === "SUCCESS" || run.status === "PARTIAL_SUCCESS",
        detail: run.detail,
        checkedAt: new Date().toISOString(),
      })),
    );

    await recordAcquisitionRun(
      ownerId,
      {
        startedAt,
        completedAt: new Date().toISOString(),
        status: runs.every((run) => run.status === "SUCCESS") ? "SUCCESS" : "PARTIAL_SUCCESS",
        detail: "Automatic capture run (10-minute cron).",
        observed: result.observed,
        kept: result.opportunities.length,
        rejected: result.rejected.length,
        duplicates: result.duplicates,
        created: inserted.length,
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

    results.push({ ownerId, created: inserted.length, rejected: result.rejected.length });
  }

  return NextResponse.json({ ok: true, owners: ownerIds.length, results });
}
