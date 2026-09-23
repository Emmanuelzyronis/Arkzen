import type { ServiceProfile } from "./types";

/**
 * What the operator sells. This is configuration, not code: the capture screen
 * can replace it and every score, strategy and draft changes with it.
 */
export const defaultServiceProfile: ServiceProfile = {
  id: "profile-ai-product-engineering",
  name: "AI product engineering for small teams",
  mode: "lead-gen",
  description:
    "Independent engineer who ships AI-assisted internal tools, workflow automations and product web apps for teams of 5-60 people.",
  capabilities: [
    "AI integration & RAG",
    "Internal tools & dashboards",
    "Workflow automation",
    "Next.js / React product work",
    "Postgres & data modelling",
    "CI/CD & cloud deployment",
  ],
  keywords: [
    "ai", "llm", "rag", "openai", "automation", "internal tool", "dashboard",
    "next.js", "react", "postgres", "api", "integration", "workflow", "data",
  ],
  negativeSignals: [
    "equity only", "equity-only", "unpaid", "commission only", "revenue share",
    "no budget right now", "for exposure",
  ],
  locations: ["Remote-first (EU/US overlap)"],
  minimumEngagement: "$2,000",
};

/** Capability -> the language a real post uses when it needs that capability. */
export const capabilityTerms: Record<string, string[]> = {
  "AI integration & RAG": [
    "ai", "llm", "rag", "openai", "gpt", "chatbot", "embeddings", "vector",
    "prompt", "hallucinat", "model",
  ],
  "Internal tools & dashboards": [
    "internal tool", "dashboard", "spreadsheet", "ops team", "back office",
    "reporting", "one screen", "admin", "digest",
  ],
  "Workflow automation": [
    "automate", "automation", "zapier", "n8n", "make.com", "triage", "routing",
    "reconcil", "sync", "reminder", "scheduled",
  ],
  "Next.js / React product work": [
    "next.js", "react", "website", "landing page", "frontend", "cms", "webflow",
    "marketing site", "figma",
  ],
  "Postgres & data modelling": [
    "postgres", "database", "schema", "multi-tenant", "row-level", "sql",
    "migration", "tenant",
  ],
  "CI/CD & cloud deployment": [
    "ci", "cd", "pipeline", "terraform", "aws", "deploy", "infrastructure",
    "reliability", "github actions",
  ],
};

export const operatorStack = [
  "next.js", "react", "typescript", "python", "postgres", "openai", "vercel",
  "docker", "github actions", "supabase", "n8n", "dbt",
];
