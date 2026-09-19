import type { OpportunityCategory } from "./types";
import { matchedTerms } from "./text";

const CATEGORY_TERMS: Record<OpportunityCategory, string[]> = {
  "ai-integration": [
    "ai", "llm", "rag", "openai", "gpt", "chatbot", "model", "embedding",
    "vector", "prompt", "agents", "ai-powered", "ai-assisted", "hallucinat",
  ],
  "internal-tools": [
    "internal tool", "internal dashboard", "ops team", "spreadsheet", "back office",
    "admin panel", "reporting", "one screen", "workflow tool", "digest",
  ],
  automation: [
    "automate", "automation", "zapier", "n8n", "make.com", "integration", "sync",
    "triage", "routing", "reconcil", "reminder", "scheduled", "enrichment",
  ],
  "web-app": [
    "website", "next.js", "react", "cms", "webflow", "frontend", "marketing site",
    "landing page", "design", "figma", "shopify theme", "pages",
  ],
  backend: [
    "postgres", "multi-tenant", "multi tenant", "rails", "api", "architecture",
    "permissions", "row-level", "tenant", "audit log", "ci", "pipeline", "terraform",
    "kubernetes", "aws", "deploy", "infrastructure", "reliability",
  ],
  data: [
    "dbt", "snowflake", "warehouse", "etl", "analytics", "bigquery", "databricks",
    "data pipeline", "reporting layer", "cost audit", "materialisation",
  ],
};

const CATEGORY_LABELS: Record<OpportunityCategory, string> = {
  "ai-integration": "AI integration",
  "internal-tools": "Internal tools",
  automation: "Automation",
  "web-app": "Web app / site",
  backend: "Backend & infrastructure",
  data: "Data & analytics",
};

/**
 * The readable name of a kind of work.
 *
 * Takes a plain string, not the union, because the category arrives from a
 * stored payload written by an older build — a value this map has never heard of
 * is a real possibility and must not render as a blank cell. Anything unmapped
 * degrades to the slug in words ("Web app / site" style), the same way
 * `sourceLabel` handles a source it does not know.
 */
export function categoryLabel(category: string): string {
  if (CATEGORY_LABELS[category as OpportunityCategory]) {
    return CATEGORY_LABELS[category as OpportunityCategory];
  }
  return category
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export interface CategoryMatch {
  category: OpportunityCategory;
  matched: string[];
  score: number;
}

/**
 * Deterministic, explainable categorisation.
 *
 * Terms matched in the title carry extra weight — a post's title is the most
 * deliberate statement of what it is about — and multi-word phrases count for
 * more than loose single words.
 */
export function detectCategory(title: string, body = ""): CategoryMatch {
  const normalizedTitle = title.toLowerCase();
  const matches: CategoryMatch[] = (Object.keys(CATEGORY_TERMS) as OpportunityCategory[]).map(
    (category) => {
      const matched = matchedTerms(`${title} ${body}`, CATEGORY_TERMS[category]);
      const score = matched.reduce((total, term) => {
        const base = term.includes(" ") ? 1.5 : 1;
        return total + (normalizedTitle.includes(term.toLowerCase()) ? base * 1.5 : base);
      }, 0);
      return { category, matched, score: Math.round(score * 10) / 10 };
    },
  );

  matches.sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  const best = matches[0];
  if (!best || best.score === 0) {
    return { category: "internal-tools", matched: [], score: 0 };
  }
  return best;
}

export { CATEGORY_TERMS };
