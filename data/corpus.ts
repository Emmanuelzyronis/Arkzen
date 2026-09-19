import type { CandidateSignal } from "@/lib/domain/types";

/**
 * Reviewed capture corpus.
 *
 * These are representative public opportunity posts, captured and reviewed by
 * hand, replayed through the exact same pipeline a live source uses. `ageHours`
 * is resolved against capture time so freshness scoring stays meaningful.
 *
 * This corpus is demo data and is labelled as such everywhere in the product.
 * Live sources (Reddit public listings) feed the same pipeline when reachable.
 */
export interface CorpusEntry {
  sourceObjectId: string;
  sourceName: string;
  canonicalUrl: string;
  title: string;
  content: string;
  author: CandidateSignal["author"];
  ageHours: number;
  provenance: Record<string, string>;
  meta: Record<string, string | number | boolean>;
}

export const corpus: CorpusEntry[] = [
  {
    sourceObjectId: "corpus:ai-internal-tool-001",
    sourceName: "r/startups",
    canonicalUrl: "https://www.reddit.com/r/startups/comments/corpus_ai_internal_tool/",
    title:
      "Need someone to build an AI tool that turns our support tickets into product insights",
    content: `We're a 12-person DTC sleep brand doing ~4,000 support tickets/month across email and Instagram DMs.

Right now two people manually tag tickets in a spreadsheet and every Friday someone writes a summary for the product team. It takes a full day every week and the summary is basically vibes.

What I want: an internal tool where a support ticket comes in, gets classified (bug / shipping / sizing / refund / feature request), and we get a weekly digest of the top themes with counts and a couple of example quotes per theme. Ideally we can click through from a theme to the original tickets.

Stack is not religious, but we already live in Postgres and Vercel. We have an OpenAI account. I'd rather buy something small and working than a big platform. Budget is around $8-12k depending on scope, and I'd love to have something usable within a month because Q4 planning starts in six weeks.

I'm technical enough to be dangerous but I don't have bandwidth to build this myself. Happy to get on a call and show you the current spreadsheet mess.`,
    author: {
      handle: "u/lena_builds",
      displayName: "Lena",
      role: "Founder / ops lead",
      org: "DTC sleep brand, 12 people",
      publicContext: [
        "Posted 3 weeks ago asking for help reducing support volume before Q4",
        "Commented in r/startups about running ops without a data team",
        "Shopify + Klaviyo + Gorgias mentioned across recent posts",
      ],
    },
    ageHours: 6,
    provenance: { community: "r/startups", flair: "I will not promote", signal: "explicit-request" },
    meta: { comments: 18, upvotes: 41 },
  },
  {
    sourceObjectId: "corpus:lead-triage-automation-002",
    sourceName: "r/forhire",
    canonicalUrl: "https://www.reddit.com/r/forhire/comments/corpus_lead_triage/",
    title:
      "[HIRING] Automate triage for ~400 inbound leads a week (n8n or Make + AI)",
    content: `We run a B2B agency in the UK, 14 people. About 400 inbound leads a month land in a shared inbox and get triaged by hand — it's the bottleneck on our SDR team.

We want: enrichment (company size, industry, tech stack), an AI-written one-line summary, a score against our ICP, and routing to the right rep in Slack. Anything obviously junk should be tagged, not deleted.

We already use HubSpot and Slack, and we have a paid n8n cloud account. I don't care whether it's n8n, Make, or custom code as long as we can maintain it and see why a lead got scored a certain way.

Budget: happy to pay a $3k/month retainer or a fixed build fee around $6-9k. We'd want the first version live in 3 weeks. If it works, there's a clear follow-on to do the same for our outbound list.`,
    author: {
      handle: "u/tom_agencyops",
      displayName: "Tom",
      role: "Head of growth ops",
      org: "B2B agency, 14 people (UK)",
      publicContext: [
        "Runs agency ops, has posted about HubSpot workflows twice this year",
        "Commented about being burned by a previous freelancer who vanished mid-build",
      ],
    },
    ageHours: 30,
    provenance: { community: "r/forhire", flair: "Hiring", signal: "explicit-request" },
    meta: { comments: 26, upvotes: 12 },
  },
  {
    sourceObjectId: "corpus:rag-internal-docs-003",
    sourceName: "r/artificial",
    canonicalUrl: "https://www.reddit.com/r/artificial/comments/corpus_rag_docs/",
    title: "Want to put our internal docs behind a chatbot for the support team — where do I start?",
    content: `We have ~900 Confluence pages and a support team of 6 who currently answer internal questions by searching Confluence and pinging people on Slack.

I want a Slack bot that answers "how do we handle X" with a link to the source page. If it doesn't know, it should say so instead of inventing an answer — that part matters more to me than getting fancy.

I've read a lot about RAG and vector databases and I'm overwhelmed. I'd much rather pay someone who has shipped this before to set it up properly, including the eval side so we can tell whether answers are actually good.

Confluence + Slack + Google Workspace. Open to whatever else. Budget in the $5-8k range for a first version, could go higher if it needs care.`,
    author: {
      handle: "u/mira_ops",
      displayName: "Mira",
      role: "Support lead",
      org: "Fintech ops team (~60 people)",
      publicContext: [
        "Asked about hallucination risk in r/artificial a week ago",
        "Said in a comment their team has no ML engineer",
      ],
    },
    ageHours: 9,
    provenance: { community: "r/artificial", flair: "Discussion", signal: "explicit-request" },
    meta: { comments: 33, upvotes: 57 },
  },
  {
    sourceObjectId: "corpus:multitenant-rails-004",
    sourceName: "r/SaaS",
    canonicalUrl: "https://www.reddit.com/r/SaaS/comments/corpus_multitenant/",
    title: "Hiring a contractor to make our Rails app properly multi-tenant",
    content: `Our app started as one company's internal tool and turned into a product. We now have 9 paying customers sharing one database with a tenant_id column that half the queries forget to filter.

I need someone experienced to: introduce proper row-level tenancy (or argue convincingly for schema-per-tenant), add the missing tests so this doesn't silently break, and migrate the existing data without downtime. We have a solid test suite but no tenancy tests.

Rails 7, Postgres, hosted on Render. We have a staging environment that mirrors production. I'd like to pair with you for the first week so our two engineers learn the pattern rather than just inheriting code they don't understand.

Rate: $70-90/hr, expecting 60-100 hours spread over 6 weeks. There may be follow-on work on permissions and audit logging.`,
    author: {
      handle: "u/dev_priya",
      displayName: "Priya",
      role: "CTO",
      org: "B2B SaaS, seed stage",
      publicContext: [
        "Posted about SOC2 prep earlier this year",
        "Has hired two contractors through r/SaaS before, both posts mention paying on time",
      ],
    },
    ageHours: 52,
    provenance: { community: "r/SaaS", flair: "Hiring", signal: "explicit-request" },
    meta: { comments: 21, upvotes: 30 },
  },
  {
    sourceObjectId: "corpus:nextjs-marketing-site-005",
    sourceName: "r/forhire",
    canonicalUrl: "https://www.reddit.com/r/forhire/comments/corpus_marketing_site/",
    title: "[HIRING] Next.js marketing site + CMS for a 3-product company",
    content: `We're consolidating three WordPress sites into one Next.js site. Design is done in Figma (about 14 pages), we have copy, we have a brand system.

Scope: build the site with a CMS so marketing can edit without us, set up blog + case studies, wire up analytics, and get decent Lighthouse scores. Deployment on Vercel.

Looking for someone who has done a headless CMS build before and can tell us which CMS to pick and why. Timeline is flexible, ideally live in 6 weeks. Budget $5-7k.

Send examples of sites you've shipped, please.`,
    author: {
      handle: "u/henrik_marketing",
      displayName: "Henrik",
      role: "Marketing director",
      org: "Software company, 40 people",
    },
    ageHours: 70,
    provenance: { community: "r/forhire", flair: "Hiring", signal: "explicit-request" },
    meta: { comments: 44, upvotes: 8 },
  },
  {
    sourceObjectId: "corpus:flakey-pipeline-006",
    sourceName: "r/devops",
    canonicalUrl: "https://www.reddit.com/r/devops/comments/corpus_flaky_pipeline/",
    title: "Fix our flaky deploy pipeline — GitHub Actions + Terraform, we're scared to ship",
    content: `Deploys fail maybe 1 in 4 times and we just re-run the job until it's green. Two engineers have started batching changes to avoid the pipeline, which is how you get 3am incidents.

Symptoms: intermittent timeouts on the integration test stage, Terraform state conflicts when two PRs run at once, and a staging environment that drifts from production.

I want someone to come in, find the real causes, fix the pipeline, and leave us with documentation and alerts we trust. We're on AWS (ECS, RDS), GitHub Actions, Terraform Cloud.

Budget: $4-5k fixed for the diagnosis + fix, with the option of a monthly reliability retainer afterwards if it goes well.`,
    author: {
      handle: "u/marco_infra",
      displayName: "Marco",
      role: "Engineering manager",
      org: "Logistics software, 22 engineers",
      publicContext: [
        "Commented in r/devops about adopting Terraform Cloud six months ago",
        "Posted a postmortem thread about a November outage",
      ],
    },
    ageHours: 26,
    provenance: { community: "r/devops", flair: "Hiring", signal: "explicit-request" },
    meta: { comments: 29, upvotes: 66 },
  },
  {
    sourceObjectId: "corpus:shopify-xero-recon-007",
    sourceName: "r/smallbusiness",
    canonicalUrl: "https://www.reddit.com/r/smallbusiness/comments/corpus_shopify_xero/",
    title: "Anyone automated Shopify → Xero reconciliation? It eats 15 hours a month",
    content: `We do about 1,200 orders a month on Shopify plus Amazon, and reconciling payouts, fees and refunds into Xero is a manual nightmare. Our bookkeeper spends roughly 15 hours a month on it and still finds discrepancies.

I want to know if this is automatable, and roughly what it would cost. I asked a dev agency and got a $20k quote which felt like a lot for what seems like a plumbing problem, but maybe I'm wrong.

If it can be done for a sane price I'll pay for it — the bookkeeper hours alone are worth it. I just have no idea what "sane" is here.`,
    author: {
      handle: "u/dana_shop",
      displayName: "Dana",
      role: "Owner",
      org: "Ecommerce retailer, 6 people",
    },
    ageHours: 16,
    provenance: { community: "r/smallbusiness", flair: "Question", signal: "explicit-request" },
    meta: { comments: 37, upvotes: 22 },
  },
  {
    sourceObjectId: "corpus:snowflake-cost-008",
    sourceName: "r/dataengineering",
    canonicalUrl: "https://www.reddit.com/r/dataengineering/comments/corpus_snowflake_cost/",
    title: "Our Snowflake bill doubled in two months — looking for someone to audit our dbt project",
    content: `We're a 30-person analytics-heavy team. Our Snowflake spend went from $9k to $19k/month and nobody can explain it. We have about 300 dbt models, a lot of them incremental but several look like full refreshes running on a schedule nobody owns.

I'm looking for a contractor to audit the warehouse usage, find the biggest offenders, fix the dbt materialisations, and set up cost monitoring so this doesn't happen again. Deliverable is a report plus merged PRs.

We have dbt Cloud, Fivetran, Snowflake. The ideal person has done a cost audit before and can explain trade-offs to a non-data exec. Timeline: start within a couple of weeks. Budget is open for the right person, though I'd expect something in the $8-15k range for the engagement.`,
    author: {
      handle: "u/raj_data",
      displayName: "Raj",
      role: "Analytics lead",
      org: "Marketplace, 30 people",
      publicContext: ["Active in r/dataengineering answering dbt questions", "Mentioned a hiring freeze for full-time roles"],
    },
    ageHours: 100,
    provenance: { community: "r/dataengineering", flair: "Hiring", signal: "explicit-request" },
    meta: { comments: 25, upvotes: 88 },
  },
  {
    sourceObjectId: "corpus:nonprofit-grant-report-009",
    sourceName: "r/nonprofit",
    canonicalUrl: "https://www.reddit.com/r/nonprofit/comments/corpus_grant_report/",
    title: "Automating grant reporting in Google Sheets — is this a real project or am I dreaming?",
    content: `Small nonprofit, 8 staff, 22 active grants. Each grant has its own reporting template and deadlines, and we track them across four Google Sheets that only one person fully understands.

I'd love something that pulls our program data (currently in Airtable) into each report template, tracks deadlines, and reminds the right person. We don't have a big budget — realistically $1,500-2,500 — and I know that's small. Happy to hear if that's unrealistic, or if there's a cheaper path.`,
    author: {
      handle: "u/sam_nonprofit",
      displayName: "Sam",
      role: "Operations manager",
      org: "Nonprofit, 8 staff",
    },
    ageHours: 120,
    provenance: { community: "r/nonprofit", flair: "Question", signal: "explicit-request" },
    meta: { comments: 14, upvotes: 19 },
  },
  {
    sourceObjectId: "corpus:internal-dashboard-010",
    sourceName: "r/Entrepreneur",
    canonicalUrl: "https://www.reddit.com/r/Entrepreneur/comments/corpus_internal_dashboard/",
    title: "Anyone know a dev who can build an internal dashboard for our ops team?",
    content: `Our ops team runs on three spreadsheets and a prayer. I want one screen that shows: orders awaiting fulfilment, late shipments, and customer complaints by week.

We use Shopify, ShipStation and a custom Postgres database. I don't have a spec because I don't know what's possible. Looking for someone who can help me figure out the spec and then build it.

Not sure on budget yet — depends what it takes. Would rather start with a paid discovery call than guess.`,
    author: {
      handle: "u/cole_ops",
      displayName: "Cole",
      role: "Founder",
      org: "Fulfilment startup, 9 people",
    },
    ageHours: 3,
    provenance: { community: "r/Entrepreneur", flair: "Question", signal: "explicit-request" },
    meta: { comments: 11, upvotes: 15 },
  },
  {
    sourceObjectId: "corpus:webflow-migration-011",
    sourceName: "r/agency",
    canonicalUrl: "https://www.reddit.com/r/agency/comments/corpus_webflow_migration/",
    title: "Looking for a subcontractor for Webflow → headless Next.js migrations",
    content: `Small agency, we keep getting asked to move clients off Webflow to headless setups with Sanity. We don't have that skill in-house and I don't want to hire a full-time dev for 3 projects a year.

Looking for a reliable subcontractor we can hand 1-2 migrations per quarter to. We handle client comms, design and QA; you handle build and deployment. White-label, we pay you as a vendor.

Typical project is 10-20 pages, $4-6k of build time. First project could start in three weeks if the fit is good.`,
    author: {
      handle: "u/agency_nils",
      displayName: "Nils",
      role: "Partner",
      org: "Design agency, 11 people",
      publicContext: ["Posted two months ago looking for a Webflow-to-headless partner", "Says they've been burned by subcontractors missing deadlines"],
    },
    ageHours: 40,
    provenance: { community: "r/agency", flair: "Hiring", signal: "explicit-request" },
    meta: { comments: 16, upvotes: 9 },
  },
  {
    sourceObjectId: "corpus:noise-equity-012",
    sourceName: "r/forhire",
    canonicalUrl: "https://www.reddit.com/r/forhire/comments/corpus_equity_partner/",
    title: "Developer wanted to build my app idea — equity only, huge upside",
    content: `I have a fully validated idea in the fitness space. I need a developer to build the MVP (iOS + web) in exchange for 20% equity. No budget right now but once we raise, you'll be paid.

Looking for someone passionate who believes in the vision, not just a code monkey. Must be able to work fast and be available on calls.`,
    author: { handle: "u/founder_grind", displayName: "Alex" },
    ageHours: 20,
    provenance: { community: "r/forhire", flair: "Hiring", signal: "equity-only" },
    meta: { comments: 51, upvotes: 3 },
  },
  {
    sourceObjectId: "corpus:noise-selfpromo-013",
    sourceName: "r/forhire",
    canonicalUrl: "https://www.reddit.com/r/forhire/comments/corpus_selfpromo/",
    title: "[FOR HIRE] Senior full-stack dev, 8 years React/Node, available now",
    content: `Senior developer available for contract work. React, Node, Postgres, AWS. I've worked with startups and enterprises, and I ship fast without breaking things. Portfolio and references available on request. DM me with your project.`,
    author: { handle: "u/dev_available_now", displayName: "K" },
    ageHours: 12,
    provenance: { community: "r/forhire", flair: "For Hire", signal: "supply-not-demand" },
    meta: { comments: 4, upvotes: 2 },
  },
  {
    sourceObjectId: "corpus:noise-spam-014",
    sourceName: "r/Entrepreneur",
    canonicalUrl: "https://www.reddit.com/r/Entrepreneur/comments/corpus_spam/",
    title: "Make $500/day with AI automation — we build it for you, DM me now",
    content: `We set up done-for-you AI automations that print money while you sleep. Limited spots this month. DM me the word AUTOMATE and I'll send the playbook. No experience needed, everything included, results guaranteed.`,
    author: { handle: "u/automate_daily_cash" },
    ageHours: 5,
    provenance: { community: "r/Entrepreneur", flair: "Promo", signal: "spam" },
    meta: { comments: 2, upvotes: 1 },
  },
  {
    sourceObjectId: "corpus:noise-unpaid-015",
    sourceName: "r/forhire",
    canonicalUrl: "https://www.reddit.com/r/forhire/comments/corpus_unpaid/",
    title: "Unpaid intern wanted to help maintain our WordPress plugins",
    content: `Small nonprofit looking for an unpaid intern for 10 hours a week to help maintain WordPress plugins and update content. Great learning opportunity and a reference at the end. Must be local to the Bay Area.`,
    author: { handle: "u/wp_intern_search" },
    ageHours: 60,
    provenance: { community: "r/forhire", flair: "Hiring", signal: "unpaid" },
    meta: { comments: 8, upvotes: 1 },
  },
];
