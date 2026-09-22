import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";

export const redditUserAgent = "web:arkzen-portfolio:v1.0 (opportunity research demo)";

interface RedditListingChild {
  data?: {
    id?: string;
    name?: string;
    title?: string;
    selftext?: string;
    author?: string;
    permalink?: string;
    created_utc?: number;
    subreddit?: string;
    num_comments?: number;
    score?: number;
    link_flair_text?: string;
  };
}

/** Maps an untrusted provider payload to our own normalized candidate shape. */
export function normalizeRedditListing(
  payload: unknown,
  community: string,
  _profile: ServiceProfile,
): CandidateSignal[] {
  const children = (payload as { data?: { children?: RedditListingChild[] } })?.data?.children;
  if (!Array.isArray(children)) return [];
  const capturedAt = new Date().toISOString();

  return children.flatMap((child) => {
    const post = child?.data;
    if (!post?.id || !post.title || !post.permalink) return [];
    const body = (post.selftext ?? "").trim();
    if (body.length < 60) return [];
    return [
      {
        sourceObjectId: `reddit:${post.id}`,
        sourceKind: "reddit" as const,
        sourceName: `r/${post.subreddit ?? community}`,
        canonicalUrl: `https://www.reddit.com${post.permalink}`,
        title: post.title,
        content: body.length > 4000 ? `${body.slice(0, 4000)}…` : body,
        author: { handle: `u/${post.author ?? "unknown"}` },
        publishedAt: new Date((post.created_utc ?? Date.now() / 1000) * 1000).toISOString(),
        capturedAt,
        providerId: "reddit-oauth",
        provenance: {
          community: post.subreddit ?? community,
          flair: post.link_flair_text ?? "none",
          comments: String(post.num_comments ?? 0),
          upvotes: String(post.score ?? 0),
        },
        dataKind: "live" as const,
        meta: {
          comments: post.num_comments ?? 0,
          upvotes: post.score ?? 0,
        },
      },
    ];
  });
}
