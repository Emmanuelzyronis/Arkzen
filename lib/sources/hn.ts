import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
const TIMEOUT_MS = 8000;
const HN_ITEM_URL = "https://news.ycombinator.com/item?id=";

function stripHtml(html: string): string {
  return html
    .replace(/<p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/ {2,}/g, " ")
    .trim();
}

interface AlgoliaHit {
  objectID: string;
  author?: string;
  title?: string;
  story_text?: string;
  comment_text?: string;
  created_at?: string;
  created_at_i?: number;
  num_comments?: number;
  points?: number;
  story_id?: number;
  parent_id?: number;
}

interface AlgoliaResponse {
  hits: AlgoliaHit[];
  nbHits: number;
}

async function findCurrentHiringThreadId(): Promise<string | null> {
  const res = await fetch(
    `${ALGOLIA_BASE}/search_by_date?query=Ask+HN+Who+is+hiring&tags=story,ask_hn&hitsPerPage=5`,
    { signal: AbortSignal.timeout(TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as AlgoliaResponse;
  const thread = data.hits.find(
    (h) => h.title && /who is hiring/i.test(h.title) && !h.title.toLowerCase().includes("wants to"),
  );
  return thread?.objectID ?? null;
}

function buildCapabilityQuery(profile: ServiceProfile): string {
  const terms = [
    ...(profile.capabilities ?? []).slice(0, 4),
    "remote",
    "engineer",
  ]
    .join(" ")
    .slice(0, 100);
  return terms || "engineer developer remote";
}

/**
 * Hacker News "Who is hiring?" source.
 *
 * Each month YC posts "Ask HN: Who is hiring?" — hundreds of companies reply
 * with structured job postings. These are verified demand-side signals: a real
 * company, a real budget, a specific role, no scraping required, no auth.
 *
 * Searches the current month's thread for comments that match the service
 * profile capabilities, producing CandidateSignal objects for each relevant
 * company posting.
 */
export const hnSource: SourceAdapter = {
  id: "hn-who-is-hiring",
  name: "Hacker News",
  kind: "community",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: true,
      notes: "HN Algolia search — no auth required. Uses the monthly 'Who is hiring?' thread.",
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(`${ALGOLIA_BASE}/search_by_date?query=hiring&hitsPerPage=1`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return {
          providerId: "hn-who-is-hiring",
          available: false,
          detail: `HN Algolia returned HTTP ${res.status}.`,
          checkedAt,
        };
      }
      return {
        providerId: "hn-who-is-hiring",
        available: true,
        detail: "HN Algolia reachable.",
        checkedAt,
      };
    } catch (error) {
      return {
        providerId: "hn-who-is-hiring",
        available: false,
        detail: `HN Algolia unreachable: ${(error as Error).message}`,
        checkedAt,
      };
    }
  },

  async search(profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const capturedAt = new Date().toISOString();

    try {
      const threadId = await findCurrentHiringThreadId();
      if (!threadId) {
        return {
          status: "PROVIDER_ERROR",
          detail: "Could not locate the current HN 'Who is hiring?' thread.",
          signals: [],
        };
      }

      const query = buildCapabilityQuery(profile);
      const res = await fetch(
        `${ALGOLIA_BASE}/search_by_date?query=${encodeURIComponent(query)}&tags=comment,story_${threadId}&hitsPerPage=${Math.min(limit * 2, 50)}`,
        { signal: AbortSignal.timeout(TIMEOUT_MS) },
      );

      if (!res.ok) {
        return {
          status: "PROVIDER_ERROR",
          detail: `HN Algolia returned HTTP ${res.status} searching thread ${threadId}.`,
          signals: [],
        };
      }

      const data = (await res.json()) as AlgoliaResponse;
      const signals: CandidateSignal[] = [];

      for (const hit of data.hits) {
        const raw = hit.comment_text ?? "";
        if (!raw) continue;
        const content = stripHtml(raw);
        if (content.length < 80) continue; // skip one-liners and meta-comments

        // Parse out the company name — HN convention: first line is "Company | Role | ..."
        const firstLine = content.split("\n")[0] ?? "";
        const company = firstLine.includes("|")
          ? firstLine.split("|")[0].trim()
          : firstLine.slice(0, 60).trim();

        const title = company
          ? `${company} is hiring (HN)`
          : `Hiring post from u/${hit.author ?? "unknown"}`;

        signals.push({
          sourceObjectId: `hn:${hit.objectID}`,
          sourceKind: "community",
          sourceName: "Hacker News",
          canonicalUrl: `${HN_ITEM_URL}${hit.objectID}`,
          title,
          content: content.length > 4000 ? `${content.slice(0, 4000)}…` : content,
          author: { handle: hit.author ?? "unknown" },
          publishedAt: hit.created_at ?? new Date().toISOString(),
          capturedAt,
          providerId: "hn-who-is-hiring",
          provenance: {
            thread: threadId,
            storyId: String(hit.story_id ?? ""),
          },
          dataKind: "live",
          meta: {},
        });

        if (signals.length >= limit) break;
      }

      if (signals.length === 0) {
        return {
          status: "SUCCESS",
          detail: `HN thread ${threadId} found but no comments matched the profile query.`,
          signals: [],
        };
      }

      return {
        status: "SUCCESS",
        detail: `${signals.length} candidate signals from HN 'Who is hiring?' thread ${threadId}.`,
        signals,
      };
    } catch (error) {
      return {
        status: "PROVIDER_ERROR",
        detail: `HN search failed: ${(error as Error).message}`,
        signals: [],
      };
    }
  },
};
