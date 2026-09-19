/**
 * A cold database runs migrations and seeds the corpus on first query, so the
 * first paint of any screen does real work. The skeleton keeps the layout
 * stable while that happens rather than collapsing the page to nothing.
 */
function Bar({ className }: { className?: string }) {
  return <span className={`block rounded-full bg-surface-3 ${className ?? ""}`} />;
}

function Panel({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface p-5 shadow-card ${className ?? ""}`}>
      {children}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your opportunities.</span>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Panel key={index} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <Bar className="h-3 w-28" />
              <Bar className="h-4 w-12" />
            </div>
            <Bar className="mt-4 h-6 w-20" />
            <Bar className="mt-3 h-3 w-36" />
          </Panel>
        ))}
      </section>

      <Panel className="h-64" />

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel className="h-72" />
        <Panel className="h-72" />
      </section>
    </div>
  );
}
