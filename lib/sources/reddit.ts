import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";
import { normalizeRedditListing, redditUserAgent } from "./reddit-normalize";

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";
const TIMEOUT_MS = 8000;

// Module-level token cache. Survives across requests in a single process.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function fetchToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "User-Agent": redditUserAgent,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;

    // 5-minute buffer before actual expiry
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000,
    };
    return cachedToken.value;
  } catch {
    return null;
  }
}

/**
 * Live Reddit adapter using the official OAuth API.
 *
 * The public JSON endpoint (reddit.com/r/.../new.json) is blocked for
 * datacenter IPs. The OAuth API (oauth.reddit.com) is not — it is the
 * intended programmatic path and explicitly supports script/app credentials.
 *
 * Credentials: REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET from a "script" type
 * app registered at reddit.com/prefs/apps. No user login required for public
 * subreddits.
 *
 * Falls back to ACCESS_RESTRICTED (not an empty result) when credentials are
 * absent or the token exchange fails, so the pipeline knows the source is
 * unavailable rather than empty.
 */
export const redditSource: SourceAdapter = {
  id: "reddit-oauth",
  name: "Reddit",
  kind: "reddit",

  capabilities(): SourceCapabilities {
    const hasCredentials = !!(
      process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET
    );
    return {
      requiresCredentials: true,
      live: true,
      notes: hasCredentials
        ? "Reddit OAuth API. Credentials configured."
        : "Reddit OAuth API. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET to enable live capture.",
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return {
        providerId: "reddit-oauth",
        available: false,
        detail: "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not set. Register a script app at reddit.com/prefs/apps.",
        checkedAt,
      };
    }

    const token = await fetchToken(clientId, clientSecret);
    if (!token) {
      return {
        providerId: "reddit-oauth",
        available: false,
        detail: "Reddit OAuth token exchange failed. Check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.",
        checkedAt,
      };
    }

    try {
      const res = await fetch(`${API_BASE}/r/forhire/new?limit=1`, {
        headers: {
          Authorization: `bearer ${token}`,
          "User-Agent": redditUserAgent,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.status === 401) {
        cachedToken = null; // invalidate
        return {
          providerId: "reddit-oauth",
          available: false,
          detail: "Reddit rejected the OAuth token (401). Credentials may be invalid.",
          checkedAt,
        };
      }

      if (!res.ok) {
        return {
          providerId: "reddit-oauth",
          available: false,
          detail: `Reddit OAuth API returned HTTP ${res.status}.`,
          checkedAt,
        };
      }

      return {
        providerId: "reddit-oauth",
        available: true,
        detail: "Reddit OAuth API reachable.",
        checkedAt,
      };
    } catch (error) {
      return {
        providerId: "reddit-oauth",
        available: false,
        detail: `Reddit unreachable: ${(error as Error).message}`,
        checkedAt,
      };
    }
  },

  async search(profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return {
        status: "ACCESS_RESTRICTED",
        detail: "Reddit credentials not configured. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.",
        signals: [],
      };
    }

    const token = await fetchToken(clientId, clientSecret);
    if (!token) {
      return {
        status: "ACCESS_RESTRICTED",
        detail: "Reddit OAuth token exchange failed. Check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.",
        signals: [],
      };
    }

    const communities = ["forhire", "SaaS", "startups", "smallbusiness"];
    const collected: CandidateSignal[] = [];
    let restricted = 0;
    let failed = 0;

    const attempts = await Promise.all(
      communities.map(async (community) => {
        try {
          const res = await fetch(`${API_BASE}/r/${community}/new?limit=25`, {
            headers: {
              Authorization: `bearer ${token}`,
              "User-Agent": redditUserAgent,
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          if (res.status === 401) {
            cachedToken = null; // invalidate so next call re-fetches
            return { restricted: true, failed: false, signals: [] as CandidateSignal[] };
          }
          if (res.status === 403 || res.status === 429) {
            return { restricted: true, failed: false, signals: [] as CandidateSignal[] };
          }
          if (!res.ok) {
            return { restricted: false, failed: true, signals: [] as CandidateSignal[] };
          }

          const payload = (await res.json()) as unknown;
          return {
            restricted: false,
            failed: false,
            signals: normalizeRedditListing(payload, community, profile),
          };
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
        detail: `Reddit OAuth API restricted live capture for ${restricted} communities. Token may be invalid or communities may be restricted.`,
        signals: [],
      };
    }
    if (collected.length === 0 && failed > 0) {
      return {
        status: "PROVIDER_ERROR",
        detail: `Reddit OAuth request failed for ${failed} communities.`,
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
