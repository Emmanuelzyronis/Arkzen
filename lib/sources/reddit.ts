import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";
import { normalizeRedditListing, redditUserAgent } from "./reddit-normalize";

const TIMEOUT_MS = 6000;

/**
 * Live Reddit adapter.
 *
 * Reads Reddit's public JSON listings. Reddit regularly rate-limits or blocks
 * datacenter IPs with 403/429 — that is respected, not evaded. When the source
 * is restricted the adapter reports ACCESS_RESTRICTED and the pipeline degrades
 * to the reviewed capture corpus instead of silently returning nothing.
 */
export const redditSource: SourceAdapter = {
  id: "reddit-public-json",
  name: "Reddit",
  kind: "reddit",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: true,
      notes: "Public listing JSON. Subject to Reddit rate limits and datacenter-IP restrictions.",
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch("https://www.reddit.com/r/forhire/new.json?limit=1", {
        headers: { "user-agent": redditUserAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.status === 403 || res.status === 429) {
        return {
          providerId: "reddit-public-json",
          available: false,
          detail: `Reddit restricted this network (HTTP ${res.status}). Live capture is paused; reviewed corpus is used instead.`,
          checkedAt,
        };
      }
      if (!res.ok) {
        return {
          providerId: "reddit-public-json",
          available: false,
          detail: `Reddit returned HTTP ${res.status}.`,
          checkedAt,
        };
      }
      return {
        providerId: "reddit-public-json",
        available: true,
        detail: "Reddit public listings reachable.",
        checkedAt,
      };
    } catch (error) {
      return {
        providerId: "reddit-public-json",
        available: false,
        detail: `Reddit unreachable: ${(error as Error).message}`,
        checkedAt,
      };
    }
  },

  async search(profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const communities = ["forhire", "SaaS", "startups", "smallbusiness"];
    const collected: CandidateSignal[] = [];
    let restricted = 0;
    let failed = 0;

    const attempts = await Promise.all(
      communities.map(async (community) => {
      try {
        const res = await fetch(
          `https://www.reddit.com/r/${community}/new.json?limit=25`,
          {
            headers: { "user-agent": redditUserAgent },
            signal: AbortSignal.timeout(TIMEOUT_MS),
            cache: "no-store",
          },
        );
        if (res.status === 403 || res.status === 429) {
          return { restricted: true, failed: false, signals: [] as CandidateSignal[] };
        }
        if (!res.ok) {
          return { restricted: false, failed: true, signals: [] as CandidateSignal[] };
        }
        const payload = (await res.json()) as unknown;
        return { restricted: false, failed: false, signals: normalizeRedditListing(payload, community, profile) };
      } catch {
        return { restricted: false, failed: true, signals: [] as CandidateSignal[] };
      }
      }),
    );

    for (const attempt of attempts) {
      if (attempt.restricted) restricted += 1;
      if (attempt.failed) failed += 1;
      collected.push(...attempt.signals);
    }

    if (collected.length === 0 && restricted > 0) {
      return {
        status: "ACCESS_RESTRICTED",
        detail: `Reddit restricted live capture for ${restricted} communities (HTTP 403/429). Backed off instead of retrying.`,
        signals: [],
      };
    }
    if (collected.length === 0 && failed > 0) {
      return {
        status: "PROVIDER_ERROR",
        detail: `Reddit request failed for ${failed} communities.`,
        signals: [],
      };
    }
    return {
      status: restricted + failed > 0 ? "PARTIAL_SUCCESS" : "SUCCESS",
      detail: `${collected.length} candidate signals from ${communities.length} communities.`,
      signals: collected.slice(0, limit),
    };
  },
};
