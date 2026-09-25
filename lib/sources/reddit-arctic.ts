import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";

const ARCTIC_BASE = "https://arctic-shift.photon-reddit.com/api/posts/search";
const TIMEOUT_MS = 15_000;

/**
 * Subreddits that surface "I need X built, budget $Y" or similar demand-side
 * posts. The mix covers dedicated hiring communities plus founder communities
 * where people post about needing technical help.
 */
const LEAD_SUBREDDITS = [
  "forhire",       // [Hiring] flair = demand side; pipeline supply filter catches [For Hire]
  "hireadev",      // explicit demand-side dev hiring community
  "SaaS",          // founders who need tech built
  "entrepreneur",  // business owners looking for help
] as const;

/**
 * Phrases that indicate demand-side intent. Broad enough to capture founders
 * asking for help mid-post. The pipeline supply-side filter and word-count
 * check do the real quality gating afterwards.
 */
const HIRE_SIGNALS = [
  "looking for",
  "need a",
  "need an",
  "need someone",
  "need help",
  "seeking",
  "want to hire",
  "hiring",
  "for hire",
  "budget",
  "hourly",
  "per hour",
  "contract",
  "freelancer",
  "contractor",
  "build",
  "develop",
];

/** How far back each run looks for new posts. 48 h gives a buffer so a
 *  missed run doesn't create a gap; dedup prevents re-inserting seen posts. */
const LOOKBACK_SECONDS = 48 * 60 * 60;

interface ArcticPost {
  id: string;
  title?: string;
  selftext?: string;
  author?: string;
  permalink?: string;
  created_utc?: number;
  score?: number;
  num_comments?: number;
  url?: string;
  link_flair_text?: string;
}

interface ArcticResponse {
  data?: ArcticPost[];
}

function hasHireSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return HIRE_SIGNALS.some((s) => lower.includes(s));
}

function hasNegativeSignal(text: string, negatives: string[]): boolean {
  const lower = text.toLowerCase();
  return negatives.some((n) => lower.includes(n.toLowerCase()));
}

function hasProfileMatch(text: string, profile: ServiceProfile): boolean {
  const lower = text.toLowerCase();
  const terms = [...profile.capabilities, ...profile.keywords];
  if (terms.length === 0) return true;
  return terms.some((t) => lower.includes(t.toLowerCase()));
}

async function fetchSubreddit(subreddit: string, limit: number, afterTs: number): Promise<ArcticPost[]> {
  const url = new URL(ARCTIC_BASE);
  url.searchParams.set("subreddit", subreddit);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("limit", String(Math.min(limit * 4, 100)));
  url.searchParams.set("after", String(afterTs));

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "ArkZen/1.0 lead-gen pipeline" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const body = (await res.json()) as ArcticResponse;
  return body.data ?? [];
}

function toSignal(post: ArcticPost, subreddit: string, capturedAt: string): CandidateSignal {
  const permalink = post.permalink ?? `/r/${subreddit}/comments/${post.id}/`;
  const canonicalUrl = `https://reddit.com${permalink}`;
  const content = [post.title ?? "", post.selftext ?? ""].filter(Boolean).join("\n\n").trim();

  return {
    sourceObjectId: `reddit:${post.id}`,
    sourceKind: "community",
    sourceName: "Reddit",
    canonicalUrl,
    title: post.title ?? `Post from r/${subreddit}`,
    content: content.length > 4000 ? `${content.slice(0, 4000)}…` : content,
    author: { handle: post.author ?? "unknown" },
    publishedAt: post.created_utc
      ? new Date(post.created_utc * 1000).toISOString()
      : capturedAt,
    capturedAt,
    providerId: "arctic-reddit",
    provenance: { subreddit },
    dataKind: "live",
    meta: {
      score: post.score ?? 0,
      numComments: post.num_comments ?? 0,
    },
  };
}

/**
 * Reddit source via Arctic Shift — an open-source Reddit archiver that serves
 * cached Reddit data from any IP without authentication.
 *
 * Reddit's own JSON API blocks Azure and other datacenter IPs. Arctic Shift
 * (arctic-shift.photon-reddit.com) solved this: it's a community-maintained
 * archiver that caches Reddit at scale and exposes a clean search API.
 *
 * Each run fetches only posts from the last 48 hours using the `after`
 * timestamp parameter. The 48-hour sliding window means a run that misses a
 * day still catches everything from that window, while the DB-layer fingerprint
 * dedup prevents re-inserting posts already seen in a prior run.
 */
export const redditArcticSource: SourceAdapter = {
  id: "arctic-reddit",
  name: "Reddit",
  kind: "community",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: true,
      notes: "Arctic Shift open archiver — no auth required. Covers forhire, hireadev, SaaS, entrepreneur.",
      modes: ["lead-gen"],
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const url = new URL(ARCTIC_BASE);
      url.searchParams.set("subreddit", "entrepreneur");
      url.searchParams.set("limit", "1");
      url.searchParams.set("sort", "desc");

      const res = await fetch(url.toString(), {
        headers: { "User-Agent": "ArkZen/1.0 lead-gen pipeline" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        return {
          providerId: "arctic-reddit",
          available: false,
          detail: `Arctic Shift returned HTTP ${res.status}.`,
          checkedAt,
        };
      }
      return {
        providerId: "arctic-reddit",
        available: true,
        detail: "Arctic Shift reachable.",
        checkedAt,
      };
    } catch (error) {
      return {
        providerId: "arctic-reddit",
        available: false,
        detail: `Arctic Shift unreachable: ${(error as Error).message}`,
        checkedAt,
      };
    }
  },

  async search(profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const capturedAt = new Date().toISOString();
    const afterTs = Math.floor(Date.now() / 1000) - LOOKBACK_SECONDS;
    const errors: string[] = [];
    const seen = new Set<string>();
    const signals: CandidateSignal[] = [];

    const results = await Promise.allSettled(
      LEAD_SUBREDDITS.map((sub) => fetchSubreddit(sub, limit, afterTs)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const subreddit = LEAD_SUBREDDITS[i];

      if (result.status === "rejected") {
        errors.push(`r/${subreddit}: ${(result.reason as Error).message}`);
        continue;
      }

      for (const post of result.value) {
        if (!post.id || seen.has(post.id)) continue;
        if (post.selftext === "[removed]") continue;

        const combined = `${post.title ?? ""} ${post.selftext ?? ""}`;

        if (!hasHireSignal(combined)) continue;
        if (hasNegativeSignal(combined, profile.negativeSignals)) continue;
        if (!hasProfileMatch(combined, profile)) continue;

        seen.add(post.id);
        signals.push(toSignal(post, subreddit, capturedAt));
      }
    }

    if (signals.length === 0 && errors.length === LEAD_SUBREDDITS.length) {
      return {
        status: "PROVIDER_ERROR",
        detail: `Arctic Shift unreachable for all subreddits. Errors: ${errors.join("; ")}`,
        signals: [],
      };
    }

    const status = errors.length > 0 ? "PARTIAL_SUCCESS" : "SUCCESS";
    const detail = errors.length > 0
      ? `${signals.length} signals from ${LEAD_SUBREDDITS.length - errors.length} subreddits (last 48 h). Failed: ${errors.join("; ")}`
      : `${signals.length} candidate signals from ${LEAD_SUBREDDITS.join(", ")} (last 48 h).`;

    return { status, detail, signals: signals.slice(0, limit) };
  },
};
