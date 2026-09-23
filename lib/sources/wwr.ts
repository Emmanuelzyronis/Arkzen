import type { CandidateSignal, ServiceProfile } from "@/lib/domain/types";
import type { SearchResult, SourceAdapter, SourceCapabilities, SourceHealth } from "./types";

const RSS_URLS = [
  "https://weworkremotely.com/categories/remote-contract-jobs.rss",
];
const TIMEOUT_MS = 8000;

function extractCdata(tag: string, xml: string): string {
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\\/${tag}>`, "i");
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function extractPlain(tag: string, xml: string): string {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i");
  return (xml.match(re)?.[1] ?? "").trim();
}

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

function parseItems(xml: string): Array<{ id: string; title: string; company: string; description: string; link: string; pubDate: string }> {
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  const items = [];

  for (const m of itemMatches) {
    const block = m[1];

    // WWR title format: "Company: Job Title"
    const rawTitle = extractCdata("title", block) || extractPlain("title", block);
    if (!rawTitle) continue;

    const colonIdx = rawTitle.indexOf(":");
    const company = colonIdx > 0 ? rawTitle.slice(0, colonIdx).trim() : rawTitle;
    const jobTitle = colonIdx > 0 ? rawTitle.slice(colonIdx + 1).trim() : rawTitle;

    const description = extractCdata("description", block);
    const link = extractCdata("link", block) || extractPlain("link", block);
    const pubDate = extractPlain("pubDate", block);

    // Use link as id (stable across fetches)
    const id = link || rawTitle;

    items.push({
      id,
      title: `${company} — ${jobTitle}`,
      company,
      description,
      link,
      pubDate,
    });
  }

  return items;
}

/**
 * We Work Remotely RSS feeds — no credentials required.
 *
 * Fetches the programming and full-stack RSS categories. Each item is a
 * company job listing with title, description, and link. Parsed from XML
 * without a dependency on an XML library.
 */
export const wwrSource: SourceAdapter = {
  id: "weworkremotely",
  name: "We Work Remotely",
  kind: "job-board",

  capabilities(): SourceCapabilities {
    return {
      requiresCredentials: false,
      live: true,
      notes: "We Work Remotely RSS feeds. No auth required.",
      modes: ["job-search"],
    };
  },

  async health(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const res = await fetch(RSS_URLS[0], {
        headers: { "user-agent": "Mozilla/5.0 (compatible; ArkZen/1.0)" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { providerId: "weworkremotely", available: false, detail: `WWR returned HTTP ${res.status}.`, checkedAt };
      }
      return { providerId: "weworkremotely", available: true, detail: "WWR RSS reachable.", checkedAt };
    } catch (error) {
      return { providerId: "weworkremotely", available: false, detail: `WWR unreachable: ${(error as Error).message}`, checkedAt };
    }
  },

  async search(_profile: ServiceProfile, limit: number): Promise<SearchResult> {
    const capturedAt = new Date().toISOString();

    try {
      const results = await Promise.all(
        RSS_URLS.map(async (url) => {
          const res = await fetch(url, {
            headers: { "user-agent": "Mozilla/5.0 (compatible; ArkZen/1.0)" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) return [] as ReturnType<typeof parseItems>;
          const xml = await res.text();
          return parseItems(xml);
        }),
      );

      // Deduplicate by id across feeds
      const seen = new Set<string>();
      const items: ReturnType<typeof parseItems> = [];
      for (const batch of results) {
        for (const item of batch) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            items.push(item);
          }
        }
      }

      if (items.length === 0) {
        return { status: "PROVIDER_ERROR", detail: "WWR RSS returned no items.", signals: [] };
      }

      const signals: CandidateSignal[] = items.slice(0, limit).map((item) => {
        const content = stripHtml(item.description);

        return {
          sourceObjectId: `wwr:${Buffer.from(item.id).toString("base64").slice(0, 32)}`,
          sourceKind: "job-board",
          sourceName: "We Work Remotely",
          canonicalUrl: item.link,
          title: item.title,
          content: content.length > 4000 ? `${content.slice(0, 4000)}…` : content,
          author: { handle: item.company },
          publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
          capturedAt,
          providerId: "weworkremotely",
          provenance: {},
          dataKind: "live",
          meta: {},
        };
      });

      return {
        status: "SUCCESS",
        detail: `${signals.length} job listings from We Work Remotely.`,
        signals,
      };
    } catch (error) {
      return { status: "PROVIDER_ERROR", detail: `WWR search failed: ${(error as Error).message}`, signals: [] };
    }
  },
};
