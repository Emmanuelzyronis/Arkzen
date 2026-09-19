import { corpus } from "@/data/corpus";
import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";

export const corpusProviderId = "arkzen-reviewed-corpus";

/**
 * Replays the reviewed capture corpus through the live pipeline.
 * Nothing here is special-cased downstream: signals from this adapter are
 * filtered, deduplicated, scored and qualified exactly like live ones.
 */
export const corpusSource: SourceAdapter = {
  id: corpusProviderId,
  name: "Reviewed capture corpus",
  kind: "demo",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: false,
      notes:
        "Hand-reviewed public opportunity posts, replayed with their original structure and age so the pipeline can be demonstrated end to end without depending on a third-party API.",
    };
  },

  async health(): Promise<SourceHealth> {
    return {
      providerId: corpusProviderId,
      available: true,
      detail: `${corpus.length} reviewed captures available.`,
      checkedAt: new Date().toISOString(),
    };
  },

  async search(_profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const now = Date.now();
    const capturedAt = new Date(now).toISOString();
    const signals: CandidateSignal[] = corpus.slice(0, limit).map((entry) => ({
      sourceObjectId: entry.sourceObjectId,
      sourceKind: "reddit",
      sourceName: entry.sourceName,
      canonicalUrl: entry.canonicalUrl,
      title: entry.title,
      content: entry.content,
      author: entry.author,
      publishedAt: new Date(now - entry.ageHours * 3_600_000).toISOString(),
      capturedAt,
      providerId: corpusProviderId,
      provenance: { ...entry.provenance, capture: "reviewed-corpus" },
      dataKind: "seeded",
      meta: entry.meta,
    }));

    return {
      status: "SUCCESS",
      detail: `${signals.length} reviewed captures replayed.`,
      signals,
    };
  },
};
