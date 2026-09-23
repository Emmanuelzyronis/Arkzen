import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import { hnSource } from "./hn";
import { remoteokSource } from "./remoteok";
import { remotiveSource } from "./remotive";
import type { RunStatus, SourceAdapter, SourceHealth } from "./types";

// We Work Remotely removed: Cloudflare blocks server-side requests (403).
export const sources: SourceAdapter[] = [hnSource, remotiveSource, remoteokSource];

export function getSource(id: string): SourceAdapter | undefined {
  return sources.find((source) => source.id === id);
}

export interface SourceRun {
  sourceId: string;
  sourceName: string;
  status: RunStatus;
  detail: string;
  count: number;
  durationMs: number;
  live: boolean;
}

export interface AcquisitionResult {
  signals: CandidateSignal[];
  runs: SourceRun[];
}

/**
 * Fans out over every registered source. One source failing never hides
 * another source's results, and an empty run is always distinguishable from a
 * blocked one because the run status is carried all the way to the UI.
 *
 * Sources are filtered by the profile's `mode` field: each source declares
 * which modes it applies to via `capabilities().modes`. A source with no
 * declared modes runs in every mode.
 */
export async function acquireAll(options?: {
  profile: ServiceProfile;
  limitPerSource?: number;
  now?: () => number;
}): Promise<AcquisitionResult> {
  const profile = options?.profile ?? ({} as ServiceProfile);
  const limit = options?.limitPerSource ?? 25;
  const now = options?.now ?? (() => Date.now());
  const signals: CandidateSignal[] = [];
  const runs: SourceRun[] = [];

  const mode = profile.mode ?? "job-search";
  const activeSources = sources.filter((source) => {
    const caps = source.capabilities();
    if (!caps.modes || caps.modes.length === 0) return true;
    return caps.modes.includes(mode);
  });

  const settled = await Promise.all(
    activeSources.map(async (source) => {
      const started = now();
      try {
        const result = await source.search(profile, limit);
        return { source, result, durationMs: now() - started };
      } catch (error) {
        return {
          source,
          result: {
            status: "PROVIDER_ERROR" as const,
            detail: (error as Error).message,
            signals: [] as CandidateSignal[],
          },
          durationMs: now() - started,
        };
      }
    }),
  );

  for (const { source, result, durationMs } of settled) {
    signals.push(...result.signals);
    runs.push({
      sourceId: source.id,
      sourceName: source.name,
      status: result.status,
      detail: result.detail,
      count: result.signals.length,
      durationMs,
      live: source.capabilities().live,
    });
  }

  return { signals, runs };
}

export async function healthCheckAll(): Promise<SourceHealth[]> {
  return Promise.all(sources.map((source) => source.health()));
}

export { hnSource, remoteokSource, remotiveSource };
export type { SourceAdapter, RunStatus, SourceHealth };
