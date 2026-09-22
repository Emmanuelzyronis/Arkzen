import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";

const API_URL = "https://remoteok.com/api";
const TIMEOUT_MS = 8000;
// RemoteOK requires a real browser user-agent or returns 403
const USER_AGENT = "Mozilla/5.0 (compatible; ArkZen/1.0)";

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Fix common UTF-8 mojibake from double-encoding
    .replace(/â€™/g, "'")
    .replace(/â€"/g, "—")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/Â /g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

interface RemoteOKJob {
  slug: string;
  id: string;
  epoch: number;
  date: string;
  company: string;
  position: string;
  tags: string[];
  description: string;
  location: string;
  salary_min: number;
  salary_max: number;
  apply_url: string;
  url: string;
}

/**
 * RemoteOK public API — no credentials required.
 *
 * Returns remote job listings filtered by tag. High volume source covering
 * dev, SaaS, and startup roles. Requires a browser-like user-agent.
 */
export const remoteokSource: SourceAdapter = {
  id: "remoteok",
  name: "RemoteOK",
  kind: "job-board",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: true,
      notes: "RemoteOK public API. No auth required. Requires browser user-agent.",
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(`${API_URL}?tags=dev&limit=1`, {
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { providerId: "remoteok", available: false, detail: `RemoteOK returned HTTP ${res.status}.`, checkedAt };
      }
      return { providerId: "remoteok", available: true, detail: "RemoteOK API reachable.", checkedAt };
    } catch (error) {
      return { providerId: "remoteok", available: false, detail: `RemoteOK unreachable: ${(error as Error).message}`, checkedAt };
    }
  },

  async search(_profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const capturedAt = new Date().toISOString();
    // Search two relevant tag combinations and merge
    const queries = ["dev,saas", "typescript,javascript"];

    try {
      const results = await Promise.all(
        queries.map(async (tags) => {
          const res = await fetch(`${API_URL}?tags=${tags}`, {
            headers: { "user-agent": USER_AGENT },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) return [] as RemoteOKJob[];
          const data = (await res.json()) as unknown[];
          // First element is metadata, skip it
          return (data.slice(1) as RemoteOKJob[]).filter((j) => j?.id && j?.position);
        }),
      );

      // Deduplicate by id across tag queries
      const seen = new Set<string>();
      const jobs: RemoteOKJob[] = [];
      for (const batch of results) {
        for (const job of batch) {
          if (!seen.has(job.id)) {
            seen.add(job.id);
            jobs.push(job);
          }
        }
      }

      if (jobs.length === 0) {
        return { status: "PROVIDER_ERROR", detail: "RemoteOK returned no jobs.", signals: [] };
      }

      const signals: CandidateSignal[] = jobs.slice(0, limit).map((job) => {
        const content = stripHtml(job.description);
        const salary =
          job.salary_min > 0
            ? `Salary: $${job.salary_min.toLocaleString()}–$${job.salary_max.toLocaleString()}. `
            : "";
        const loc = job.location ? `Location: ${job.location}. ` : "";
        const enriched = `${salary}${loc}${content}`;

        return {
          sourceObjectId: `remoteok:${job.id}`,
          sourceKind: "job-board",
          sourceName: "RemoteOK",
          canonicalUrl: job.url,
          title: `${job.company} — ${job.position}`,
          content: enriched.length > 4000 ? `${enriched.slice(0, 4000)}…` : enriched,
          author: { handle: job.company },
          publishedAt: new Date(job.epoch * 1000).toISOString(),
          capturedAt,
          providerId: "remoteok",
          provenance: {
            tags: (job.tags ?? []).slice(0, 6).join(","),
          },
          dataKind: "live",
          meta: {},
        };
      });

      return {
        status: "SUCCESS",
        detail: `${signals.length} job listings from RemoteOK.`,
        signals,
      };
    } catch (error) {
      return { status: "PROVIDER_ERROR", detail: `RemoteOK search failed: ${(error as Error).message}`, signals: [] };
    }
  },
};
