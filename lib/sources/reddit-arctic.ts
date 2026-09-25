import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";

const ARCTIC_BASE = "https://arctic-shift.photon-reddit.com/api/posts/search";
const TIMEOUT_MS = 15_000;

/**
 * Subreddits that surface "I need X built, budget $Y" posts.
 * Kept tight — broader communities (webdev, Python) have lower signal density
 * for outreach leads and would drown the pipeline in noise.
 */
const LEAD_SUBREDDITS = ["forhire", "freelance_forhire", "entrepreneur", "startups"] as const;

/**
 * Phrases that reliably indicate a post is from someone looking to hire,
 * not someone looking for work or asking a general question.
 */
const HIRE_SIGNALS = [
  "looking for", "need a", "need an", "need someone", "seeking",
  "want to hire", "hiring", "for hire", "budget", "pay", "paid", "hourly",
  "contract", "freelancer", "contractor", "build", "develop", "fix",
];

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

async function fetchSubreddit(subreddit: string, limit: number): Promise<ArcticPost[]> {
  const url = new URL(ARCTIC_BASE);
  url.searchParams.set("subreddit", subreddit);
  url.searchParams.set("sort", "desc");
  url.searchParams.set("limit", String(Math.min(limit * 3, 100)));

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
 * Focused on subreddits where people explicitly post "I need X built, budget $Y"
 * — forhire, freelance_forhire, entrepreneur, startups. Each one is a confirmed
 * source of actionable outreach leads, not general discussion.
 */
export const redditArcticSource: SourceAdapter = {
  id: "arctic-reddit",
  name: "Reddit",
  kind: "community",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: true,
      notes: "Arctic Shift open archiver — no auth required. Covers forhire, freelance_forhire, entrepreneur, startups.",
      modes: ["lead-gen"],
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const url = new URL(ARCTIC_BASE);
      url.searchParams.set("subreddit", "forhire");
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
    const errors: string[] = [];
    const seen = new Set<string>();
    const signals: CandidateSignal[] = [];

    const results = await Promise.allSettled(
      LEAD_SUBREDDITS.map((sub) => fetchSubreddit(sub, limit)),
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
      ? `${signals.length} signals from ${LEAD_SUBREDDITS.length - errors.length} subreddits. Failed: ${errors.join("; ")}`
      : `${signals.length} candidate signals from ${LEAD_SUBREDDITS.join(", ")}.`;

    return { status, detail, signals: signals.slice(0, limit) };
  },
};
