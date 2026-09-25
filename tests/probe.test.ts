import { describe, it } from "vitest";
import { corpusSource } from "@/lib/sources/corpus-source";
import { defaultServiceProfile } from "@/lib/domain/service-profile";
import { buildOpportunities } from "@/lib/domain/pipeline";
import { assessAuthenticity } from "@/lib/domain/qualification";

describe("probe", () => {
  it("prints confidence inputs", async () => {
    const signals = (await corpusSource.search(defaultServiceProfile, 100)).signals;
    const result = buildOpportunities(signals, defaultServiceProfile);
    for (const opportunity of result.opportunities) {
      const auth = assessAuthenticity(opportunity.signal);
      console.log(
        opportunity.signal.sourceObjectId,
        "score", opportunity.score,
        "dims", [opportunity.fit, opportunity.intent, opportunity.urgency, opportunity.reachability].map((d) => d.value).join("/"),
        "auth", auth.score,
        "unknowns", opportunity.qualification.unknowns.length,
        "conf", opportunity.qualification.confidence,
        "| money", JSON.stringify(opportunity.fit.checks[4].label),
        "| moneyDetail", JSON.stringify(opportunity.fit.checks[4].detail),
        "| risks", JSON.stringify(opportunity.risks),
        "| objections", JSON.stringify(opportunity.strategy.objections.map((objection) => objection.objection)),
        "| draft", JSON.stringify(opportunity.strategy.suggestedMessage.split("\n").filter((line) => line.includes("here:") || line.includes("figure you named") || line.includes("workable") || line.includes("figure out the budget"))),
        "| reasons", JSON.stringify(opportunity.reasons),
      );
    }
    const hero = result.opportunities[0];
    for (const [name, dimension] of Object.entries({ fit: hero.fit, intent: hero.intent, urgency: hero.urgency, reachability: hero.reachability })) {
      console.log(name, dimension.value, dimension.checks.map((check) => `${check.status}:${check.label}`).join(" | "));
    }
  });
});
