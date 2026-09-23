import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";

const API_BASE = "https://remotive.com/api/remote-jobs";
const TIMEOUT_MS = 8000;

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
    .replace(/ {2,}/g, " ")
    .trim();
}

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category: string;
  tags: string[];
  job_type: string;
  publication_date: string;
  candidate_required_location: string;
  salary: string;
  description: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

/**
 * Remotive.com public API — no credentials required.
 *
 * Returns remote software job listings including contract/freelance roles.
 * Each job has a company name, stack tags, salary range, and description.
 * No auth, no rate-limit headers, ~18 results per category page.
 */
export const remotiveSource: SourceAdapter = {
  id: "remotive",
  name: "Remotive",
  kind: "job-board",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: true,
      notes: "Remotive public API. No auth required.",
      modes: ["job-search"],
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(`${API_BASE}?category=software-dev&limit=1`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { providerId: "remotive", available: false, detail: `Remotive returned HTTP ${res.status}.`, checkedAt };
      }
      return { providerId: "remotive", available: true, detail: "Remotive API reachable.", checkedAt };
    } catch (error) {
      return { providerId: "remotive", available: false, detail: `Remotive unreachable: ${(error as Error).message}`, checkedAt };
    }
  },

  async search(_profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const capturedAt = new Date().toISOString();
    // Prefer contract/freelance listings; fall back to all software roles when
    // those categories are sparse so the source still contributes signals.
    const contractQueries = [
      `${API_BASE}?category=software-dev&job_type=contract&limit=50`,
      `${API_BASE}?category=software-dev&job_type=freelance&limit=50`,
      `${API_BASE}?category=devops-sysadmin&job_type=contract&limit=25`,
    ];
    const fallbackQueries = [
      `${API_BASE}?category=software-dev&limit=50`,
      `${API_BASE}?category=devops-sysadmin&limit=25`,
    ];

    async function fetchJobs(urls: string[]): Promise<RemotiveJob[]> {
      const results = await Promise.all(
        urls.map(async (url) => {
          const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!res.ok) return [] as RemotiveJob[];
          const data = (await res.json()) as RemotiveResponse;
          return data.jobs ?? [];
        }),
      );
      // Deduplicate by id
      const seen = new Set<number>();
      const merged: RemotiveJob[] = [];
      for (const batch of results) {
        for (const job of batch) {
          if (!seen.has(job.id)) {
            seen.add(job.id);
            merged.push(job);
          }
        }
      }
      return merged;
    }

    try {
      let jobs = await fetchJobs(contractQueries);
      let usedFallback = false;

      if (jobs.length === 0) {
        // No dedicated contract listings right now — fall back to all software
        // roles so the source still contributes. The scoring pipeline will
        // rank relevance; the source's job is to supply candidates.
        jobs = await fetchJobs(fallbackQueries);
        usedFallback = true;
      }

      if (jobs.length === 0) {
        return { status: "PROVIDER_ERROR", detail: "Remotive returned no listings.", signals: [] };
      }

      const signals: CandidateSignal[] = jobs.slice(0, limit).map((job) => {
        const content = stripHtml(job.description);
        const salary = job.salary ? `Salary: ${job.salary}. ` : "";
        const location = job.candidate_required_location ? `Location: ${job.candidate_required_location}. ` : "";
        const enriched = `${salary}${location}${content}`;

        return {
          sourceObjectId: `remotive:${job.id}`,
          sourceKind: "job-board",
          sourceName: "Remotive",
          canonicalUrl: job.url,
          title: `${job.company_name} — ${job.title}`,
          content: enriched.length > 4000 ? `${enriched.slice(0, 4000)}…` : enriched,
          author: { handle: job.company_name },
          publishedAt: job.publication_date,
          capturedAt,
          providerId: "remotive",
          provenance: {
            category: job.category,
            jobType: job.job_type,
            tags: job.tags.slice(0, 6).join(","),
          },
          dataKind: "live",
          meta: {},
        };
      });

      return {
        status: "SUCCESS",
        detail: usedFallback
          ? `${signals.length} job listings from Remotive (all software roles — no contract-only listings right now).`
          : `${signals.length} contract/freelance listings from Remotive.`,
        signals,
      };
    } catch (error) {
      return { status: "PROVIDER_ERROR", detail: `Remotive search failed: ${(error as Error).message}`, signals: [] };
    }
  },
};
