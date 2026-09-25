"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { humanizeAge } from "@/lib/domain/text";
import type { RejectedSignalRow } from "@/lib/data/repository";

const RULE_TONE: Record<string, "down" | "neutral"> = {
  "supply-side post": "neutral",
  "promotional post": "down",
  "unpaid work": "neutral",
  "too thin": "neutral",
  "no-keyword-match": "neutral",
  "low-score": "neutral",
  "negative pattern": "down",
  duplicate: "neutral",
};

const RULE_LABEL: Record<string, string> = {
  "supply-side post": "Supply side",
  "promotional post": "Promotional",
  "unpaid work": "Unpaid",
  "too thin": "Too short",
  "no-keyword-match": "Off-topic",
  "low-score": "Low score",
  "negative pattern": "Blocked keyword",
  duplicate: "Duplicate",
};

export function RejectedView({ rejected }: { rejected: RejectedSignalRow[] }) {
  return (
    <div className="space-y-3">
      <div className="px-1">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Filtered out</h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          Signals the pipeline blocked before scoring. Review these for false positives.
        </p>
      </div>

      <Card>
        {rejected.length === 0 ? (
          <CardBody>
            <EmptyState
              title="Nothing filtered yet"
              body="When you run Find Leads, signals blocked by the pipeline appear here."
            />
          </CardBody>
        ) : (
          <div className="overflow-hidden">
            <div className="border-b border-line px-5 py-2.5">
              <p className="text-[12px] text-fg-muted">{rejected.length} blocked signal{rejected.length !== 1 ? "s" : ""}</p>
            </div>
            <ul className="divide-y divide-line">
              {rejected.map((row) => (
                <li key={row.fingerprint} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] font-medium leading-snug text-fg">
                      {row.title}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">
                      {row.reason}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Pill tone={RULE_TONE[row.rule] ?? "neutral"}>
                      {RULE_LABEL[row.rule] ?? row.rule}
                    </Pill>
                    <span className="text-[11px] text-fg-muted">
                      {row.sourceName} · {humanizeAge(row.publishedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
