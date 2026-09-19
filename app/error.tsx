"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Errors say what happened and offer the next step, in the product's voice.
 * They don't apologise and they aren't vague.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept in the console so a real failure is diagnosable from a bug report.
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md px-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-11 place-items-center rounded-full bg-down-bg text-down"
        >
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-fg">
          This screen didn&rsquo;t load
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
          Something failed while we were reading your opportunities. Nothing was changed
          or lost, and trying again usually works.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" onClick={reset}>
            Try again
          </Button>
        </div>
        {error.digest ? (
          <p className="mt-4 text-[11px] tabular-nums text-fg-muted">
            Reference: {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  );
}
