import { categoryLabel } from "./category";
import type { ScoredDimensions } from "./scoring";
import type { CandidateSignal, ResearchFinding } from "./types";
import { extractMoney, humanizeAge, keyExcerpt, matchedTerms, normalize, titleCase, wordCount } from "./text";

const SIZE_PATTERN = /\b(\d[\d,]*)[-\s]?(?:person|people|employee|staff|engineer|dev|headcount|team)\b/gi;

/**
 * Lightweight research: what was observed, what is inferred, and what is
 * genuinely unknown. The three are never blended — credibility depends on it.
 */
export function researchSignal(
  signal: CandidateSignal,
  dimensions: Pick<ScoredDimensions, "category" | "fit" | "intent">,
  now: Date = new Date(),
): ResearchFinding[] {
  const findings: ResearchFinding[] = [];
  const text = normalize(`${signal.title} ${signal.content}`);
  const title = titleCase(dimensions.category.category);

  findings.push({
    kind: "observed",
    label: `Source: ${signal.sourceName}`,
    detail: `${signal.title} — ${humanizeAge(signal.publishedAt, now)}. ${wordCount(signal.content)} words of first-hand detail.`,
  });

  findings.push({
    kind: "observed",
    label: `Author: ${signal.author.handle}`,
    detail: [signal.author.role, signal.author.org]
      .filter(Boolean)
      .join(" · ") || "No role or company stated in the post.",
  });

  for (const context of signal.author.publicContext ?? []) {
    findings.push({ kind: "observed", label: "Prior public context", detail: context });
  }

  const sizeMatch = [...`${signal.title} ${signal.content}`.matchAll(SIZE_PATTERN)][0];
  if (sizeMatch) {
    findings.push({
      kind: "observed",
      label: `Team size named: ${sizeMatch[0]}`,
      detail: "Stated directly in the post, so it can be used without qualification on a call.",
    });
  }

  const money = extractMoney(`${signal.title} ${signal.content}`);
  if (money !== null) {
    findings.push({
      kind: "observed",
      label: `Budget signal: $${money.toLocaleString()}`,
      detail: "Figures stated in the post. Treat as their expectation, not an agreed price.",
    });
  }

  const painSignals = ["manual", "spreadsheet", "by hand", "bottleneck", "nightmare", "drift", "discrepanc"];
  const painHits = matchedTerms(text, painSignals);
  if (painHits.length > 0) {
    findings.push({
      kind: "inference",
      label: "Likely buying trigger",
      detail: `The request is attached to an existing operational cost (${painHits.join(", ")}), which is normally what unlocks budget.`,
    });
  }

  findings.push({
    kind: "inference",
    label: `Probable category: ${categoryLabel(dimensions.category.category)}`,
    detail:
      dimensions.category.matched.length > 0
        ? `Inferred from request language: ${dimensions.category.matched.slice(0, 5).join(", ")}.`
        : "No strong category language; verify in the first conversation.",
  });

  if (dimensions.intent.value >= 70) {
    findings.push({
      kind: "inference",
      label: "Likely buying stage",
      detail: "Already decided to spend and looking for the right person — the question is fit, not need.",
    });
  } else {
    findings.push({
      kind: "inference",
      label: "Likely buying stage",
      detail: "Interested but uncommitted; expect to help shape scope before a number lands well.",
    });
  }

  findings.push({
    kind: "inference",
    label: "Best opening angle",
    detail: `Lead with ${keyExcerpt(signal.title, 90)} — mirror their words before proposing anything.`,
  });

  const openChecks = [
    ...dimensions.fit.checks,
    ...dimensions.intent.checks,
  ].filter((check) => check.status !== "pass");
  for (const check of openChecks.slice(0, 3)) {
    // A warning is a check the evidence answered against — "no overlap with
    // your stack" is a known gap, not an open question, and calling it unknown
    // would blend the two the way the comment above promises never to.
    const known = check.status === "warn";
    findings.push({
      kind: known ? "observed" : "unknown",
      label: check.label,
      detail: known
        ? "The evidence answers this one against the fit, so treat it as a gap to price in rather than a question to ask."
        : "Not stated publicly. Do not assume an answer — ask it in the first reply.",
    });
  }

  return findings;
}
