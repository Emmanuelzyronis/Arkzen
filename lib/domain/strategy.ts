import { categoryLabel } from "./category";
import { humanizeAge, keyExcerpt, matchedTerms, normalize } from "./text";
import type { ScoredDimensions } from "./scoring";
import type {
  CandidateSignal,
  NextAction,
  Objection,
  OpportunityCategory,
  Qualification,
  Strategy,
} from "./types";

interface Playbook {
  approach: string;
  firstMove: string;
  avoid: string;
  proof: string;
  followUp: string[];
}

const PLAYBOOKS: Record<OpportunityCategory, Playbook> = {
  "ai-integration": {
    approach:
      "Lead as a builder who has shipped this pattern, not as an AI enthusiast. Anchor on the evaluation question — anyone can get a demo working, keeping answers trustworthy is the actual work.",
    firstMove:
      "Offer a small, fixed-scope first step (a working slice against their real data) instead of a platform proposal.",
    avoid: "Do not lead with model names or a generic “AI transformation” pitch.",
    proof: "one production RAG/tool build with a measured accuracy check",
    followUp: [
      "Day 2 — send a two-paragraph scope sketch with the exact first milestone.",
      "Day 5 — share a short loom or screenshots of a comparable build.",
      "Day 12 — one polite nudge, then leave the door open.",
    ],
  },
  "internal-tools": {
    approach:
      "Be the person who replaces the spreadsheet, not the person who sells a platform. Show that you understood their current manual process and can delete it.",
    firstMove: "Sketch the one screen they asked for and the data it needs, then ask what is missing.",
    avoid: "Do not propose a full internal-tools suite in the first reply.",
    proof: "an internal tool that removed a recurring manual report",
    followUp: [
      "Day 2 — send the one-screen sketch and confirm the data sources.",
      "Day 6 — propose a paid week-one milestone.",
      "Day 14 — final nudge with a hard, useful question.",
    ],
  },
  automation: {
    approach:
      "Sell hours saved and error reduction, not tooling. Price against the cost of the manual work they already described.",
    firstMove: "Quantify the current manual cost from their own numbers and propose a fixed-scope pilot.",
    avoid: "Do not commit to a stack before they say who maintains it.",
    proof: "an automation running unattended for months with alerting",
    followUp: [
      "Day 1 — reply with the hours-saved estimate.",
      "Day 3 — send a short build plan with the first integration named.",
      "Day 10 — offer to start with a paid two-week pilot.",
    ],
  },
  "web-app": {
    approach:
      "Compete on delivery confidence and a clear plan, not on price. They have design and copy, so the risk they are buying down is execution.",
    firstMove: "Give a page-by-page plan with a launch date and what you need from them each week.",
    avoid: "Do not send a portfolio dump with no plan attached.",
    proof: "a comparable Next.js launch delivered on the date promised",
    followUp: [
      "Day 2 — send the plan plus two relevant builds.",
      "Day 5 — offer a fixed quote with the CMS decision explained.",
      "Day 14 — close the loop politely.",
    ],
  },
  backend: {
    approach:
      "Be the calm, senior pair of hands. They are scared of breaking production, so lead with migration safety and how you will leave their team independent.",
    firstMove: "Propose a paid diagnosis with a written findings doc and a no-downtime migration path.",
    avoid: "Do not rewrite or refactor anything before the diagnosis is agreed.",
    proof: "a zero-downtime data migration with tests added around it",
    followUp: [
      "Day 2 — send a short diagnosis outline and what you would inspect first.",
      "Day 6 — propose pairing the first week with their engineers.",
      "Day 15 — check in with a specific finding from public information.",
    ],
  },
  data: {
    approach:
      "Frame the audit around money and ownership. They need someone who can explain trade-offs to an exec, not just query the warehouse.",
    firstMove: "Offer a fixed-fee cost audit with a ranked list of offenders before any remediation work.",
    avoid: "Do not promise a percentage saving before seeing usage data.",
    proof: "a warehouse cost review that paid for itself in one month",
    followUp: [
      "Day 2 — reply with the audit outline and what data you need.",
      "Day 5 — offer to start with a one-week diagnostic.",
      "Day 12 — share a relevant before/after cost story.",
    ],
  },
};

const OBJECTION_LIBRARY: Array<{ test: RegExp | ((text: string) => boolean); objection: Objection }> = [
  {
    test: (text) => /budget (not stated|authority unknown)/.test(text),
    objection: {
      objection: "“We haven’t agreed a budget yet.”",
      likelihood: "likely",
      response:
        "Give a range tied to scope and offer a small fixed first milestone so the first yes is cheap. Never anchor with an hourly rate before the scope is written down.",
    },
  },
  {
    test: (text) => text.includes("below your minimum engagement"),
    objection: {
      objection: "“That’s more than we planned to spend.”",
      likelihood: "likely",
      response:
        "Reframe against their own numbers — the manual hours and error cost they described — and offer a narrower first version that fits the number they named.",
    },
  },
  {
    test: (text) => text.includes("no deadline given"),
    objection: {
      objection: "“Let’s pick this up next quarter.”",
      likelihood: "possible",
      response:
        "Ask what changes between now and next quarter. If nothing does, propose a paid scoping session now so the work is ready when the budget window opens.",
    },
  },
  {
    test: (text) => text.includes("no public history reviewed") || text.includes("decision authority unclear"),
    objection: {
      objection: "“I need to check with the rest of the team.”",
      likelihood: "likely",
      response:
        "Ask who else needs to be comfortable, and offer a short written summary you both can forward. Make the internal sell easy.",
    },
  },
  {
    test: (text) => text.includes("capabilities requested") && /(\d+ of)/.test(text),
    objection: {
      objection: "“Have you done this exact thing before?”",
      likelihood: "likely",
      response:
        "Name the closest comparable build, say plainly where it differs, and offer a paid first milestone that de-risks the unfamiliar part.",
    },
  },
];

function buildObjections(risks: string[], qualification: Qualification, text: string): Objection[] {
  const haystack = normalize(`${text} ${risks.join(" ")}`);
  const objections: Objection[] = [];
  for (const entry of OBJECTION_LIBRARY) {
    const matched = typeof entry.test === "function" ? entry.test(haystack) : entry.test.test(haystack);
    if (matched && objections.length < 3) objections.push(entry.objection);
  }
  if (qualification.unknowns.some((unknown) => unknown.toLowerCase().includes("budget"))) {
    if (!objections.some((objection) => objection.objection.includes("budget"))) {
      objections.unshift({
        objection: "“We haven’t agreed a budget yet.”",
        likelihood: "likely",
        response:
          "Ask what range they have in mind for a first version, then propose a fixed first milestone inside it. Do not guess at a number for them.",
      });
    }
  }
  return objections.slice(0, 3);
}

function channelFor(signal: CandidateSignal, text: string): string {
  if (matchedTerms(text, ["dm me", "dm you"]).length > 0) return "Private message";
  if (matchedTerms(text, ["email"]).length > 0) return "Email";
  if (matchedTerms(text, ["call"]).length > 0) return "Reply, then a call";
  return `${signal.sourceName} reply`;
}

function buildOpeningMessage(
  signal: CandidateSignal,
  dimensions: Pick<ScoredDimensions, "category" | "fit" | "intent" | "urgency">,
  playbook: Playbook,
  now: Date,
): string {
  const excerpt = keyExcerpt(signal.content, 150);
  const author = signal.author.displayName ?? signal.author.handle;
  // Derived from the fit check, never from the word "budget" in the post: a
  // message must not call the budget workable while the check that read it says
  // it sits below the minimum engagement.
  const budgetCheck = dimensions.fit.checks.find((check) => check.label.startsWith("Budget "));
  const budgetLine =
    budgetCheck?.status === "pass"
      ? "Your budget range sounds workable for a first version."
      : budgetCheck?.status === "warn"
        ? "The figure you named is tight for the full scope, so I'd start with a smaller version that fits it."
        : "We can figure out the budget after we agree the smallest useful version.";

  return [
    `Hi ${author} — saw your post in ${signal.sourceName} ${humanizeAge(signal.publishedAt, now)} about ${categoryLabel(dimensions.category.category).toLowerCase()}.`,
    ``,
    `"${excerpt}"`,
    ``,
    `That's the kind of work I do: ${playbook.proof}. ${budgetLine}`,
    ``,
    `If it's useful, I'd suggest we start here: ${playbook.firstMove}`,
    `Before I suggest anything specific: what does “done” look like for you at the end of the first month, and who else needs to be comfortable with the plan?`,
    ``,
    `Happy to keep it in this thread — no pitch deck.`,
  ].join("\n");
}

export function buildStrategy(
  signal: CandidateSignal,
  dimensions: ScoredDimensions,
  qualification: Qualification,
  now: Date = new Date(),
): Strategy {
  const playbook = PLAYBOOKS[dimensions.category.category];
  // The objection rules read check labels ("No deadline given"), which only
  // reach them through the checks: a passing check is already in reasons, but
  // an unknown or a warn is not, so those carry their label and detail too.
  const openChecks = [
    ...dimensions.fit.checks,
    ...dimensions.intent.checks,
    ...dimensions.urgency.checks,
    ...dimensions.reachability.checks,
  ].filter((check) => check.status !== "pass");
  const text = normalize(
    [
      signal.title,
      signal.content,
      ...dimensions.reasons,
      ...dimensions.risks,
      ...openChecks.flatMap((check) => [check.label, check.detail]),
    ].join(" "),
  );
  const evidenceUsed = [
    `Original post in ${signal.sourceName} (${humanizeAge(signal.publishedAt, now)})`,
    `${dimensions.category.matched.length} category signals: ${dimensions.category.matched.slice(0, 4).join(", ") || "none"}`,
    `${dimensions.fit.checks.find((check) => check.status === "pass")?.label ?? "Service match"}`,
    `${dimensions.intent.checks.find((check) => check.status === "pass")?.label ?? "Intent signal"}`,
  ];

  return {
    approach: playbook.approach,
    leadWith: `${playbook.firstMove} Anchor the first paragraph on “${keyExcerpt(signal.title, 80)}”.`,
    avoid: playbook.avoid,
    objections: buildObjections(dimensions.risks, qualification, text),
    suggestedMessage: buildOpeningMessage(signal, dimensions, playbook, now),
    followUpPlan: playbook.followUp,
    evidenceUsed,
  };
}

export function buildNextAction(
  signal: CandidateSignal,
  dimensions: ScoredDimensions,
  qualification: Qualification,
  now: Date = new Date(),
): NextAction {
  const text = normalize(`${signal.title} ${signal.content}`);
  const channel = channelFor(signal, text);
  const hours = Math.round(
    Math.max(0, (now.getTime() - new Date(signal.publishedAt).getTime()) / 3_600_000),
  );

  if (qualification.verdict === "WEAK") {
    return {
      action: "Review the evidence and decide whether to discard this signal",
      rationale:
        "Qualification is weak: the request does not line up with your service profile. Discarding it protects your attention.",
      channel: "Operator review",
      due: "Today",
    };
  }

  if (hours < 48) {
    return {
      action: `Send the scoped opening reply in ${channel.toLowerCase()}`,
      rationale:
        dimensions.intent.checks.find((check) => check.status === "pass")?.detail ??
        "Live request with a short decision window.",
      channel,
      due: "Within 24 hours",
    };
  }

  return {
    action: `Reply with the plan and one qualifying question via ${channel.toLowerCase()}`,
    rationale:
      "The post is no longer brand new, so lead with a concrete plan rather than a greeting — it needs to stand on its own.",
    channel,
    due: "Within 48 hours",
  };
}
