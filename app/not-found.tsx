import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A genuine miss renders inside the app shell rather than as bare Next chrome,
 * so the navigation is still there and the person can get back on track.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md px-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto grid size-11 place-items-center rounded-full bg-surface-3 text-fg-muted"
        >
          <Compass className="size-5" />
        </span>
        <h2 className="mt-4 text-[17px] font-semibold tracking-[-0.02em] text-fg">
          That page isn&rsquo;t here
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
          The link may be out of date, or the opportunity it pointed at may have been
          removed. Everything else is still where you left it.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="primary">
            <Link href="/">Go to overview</Link>
          </Button>
          <Button asChild>
            <Link href="/opportunities">See all opportunities</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
