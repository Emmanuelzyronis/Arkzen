import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import { corpusSource } from "./corpus-source";
import { hnSource } from "./hn";
import { redditSource } from "./reddit";
import { remoteokSource } from "./remoteok";
import { remotiveSource } from "./remotive";
import { wwrSource } from "./wwr";
import type { RunStatus, SourceAdapter, SourceHealth } from "./types";

export const sources: SourceAdapter[] = [redditSource, hnSource, remotiveSource, remoteokSource, wwrSource, corpusSource];

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

  const settled = await Promise.all(
    sources.map(async (source) => {
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

export { corpusSource, hnSource, redditSource, remoteokSource, remotiveSource, wwrSource };
export type { SourceAdapter, RunStatus, SourceHealth };
