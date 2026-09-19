"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Runs a capture: go and look for new leads right now.
 *
 * The reference dashboard has no equivalent control, because Skymetrics reads
 * from a warehouse that fills itself. ArkZen's sources only move when something
 * asks them to, so without this the list is a fixed set of seeded rows and the
 * whole acquire half of the product is unreachable from the interface. It is a
 * deliberate addition rather than a reproduction, and it is recorded in
 * `docs/REDESIGN.md`.
 *
 * The report is exact, because the alternative is a lie that reads as success.
 * "Found nothing" and "we were blocked from looking" are different outcomes and
 * get different words; a run where Reddit refused is not a run where there was
 * nothing to find. These are the same distinctions `capture/route.ts` already
 * makes per source, and it would be dishonest to flatten them at the last step.
 */

interface CaptureRun {
  sourceName: string;
  status: string;
  detail?: string | null;
}

interface CaptureResult {
  created: number;
  observed: number;
  kept: number;
  runs?: CaptureRun[];
}

/**
 * The sources that refused to be read.
 *
 * Names the run's own `sourceName`, which is already the word a person knows
 * ("Reddit", "Reviewed captures"). Running it through `sourceLabel` would look
 * safer and be worse: that helper is for provider ids, and it would re-case an
 * already-correct name into "Reviewed Capture Corpus".
 */
function blockedSources(runs: CaptureRun[] | undefined): string[] {
  return (runs ?? [])
    .filter((run) => run.status !== "SUCCESS" && run.status !== "PARTIAL_SUCCESS")
    .map((run) => run.sourceName);
}

export function FindLeads() {
  const router = useRouter();
  const { notify } = useToast();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // No intent: use the watch profile the workspace is already set up with
        // rather than re-asking. This is the "look again" button, not the
        // "change what we watch" screen.
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: string } | null;
        notify(problem?.error ?? "That search did not run. Try again.", "error");
        return;
      }

      const result = (await response.json()) as CaptureResult;
      const blocked = blockedSources(result.runs);

      if (result.created > 0) {
        notify(
          `Found ${result.created} new ${result.created === 1 ? "lead" : "leads"} out of ${result.observed} posts read.`,
        );
      } else if (result.observed === 0) {
        notify("Nothing came back from your sources just now.", "error");
      } else {
        notify(`Nothing new — you already have all ${result.kept} of these.`);
      }

      // Said separately and after the result, not folded into it: the count is
      // what came back, and this is what did not.
      if (blocked.length > 0) {
        notify(
          `${blocked.join(" and ")} refused the search, so ${blocked.length === 1 ? "it was" : "they were"} skipped this time.`,
          "error",
        );
      }

      router.refresh();
    } catch {
      notify("Could not reach the server. Check your connection and try again.", "error");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={run} disabled={running}>
      <Search aria-hidden="true" className="size-3.5" />
      {running ? "Looking…" : "Find new leads"}
    </Button>
  );
}
