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
      <span className="sr-only">Loading sources.</span>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Bar className="h-8 w-36 rounded-full" />
        {Array.from({ length: 4 }, (_, i) => (
          <Bar key={i} className={`h-8 rounded-full ${[28, 36, 20, 32][i]}px w-20`} />
        ))}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Panel key={i} className="py-4">
            <div className="flex items-start justify-between gap-3">
              <Bar className="h-3 w-28" />
              <Bar className="h-4 w-12" />
            </div>
            <Bar className="mt-4 h-6 w-20" />
            <Bar className="mt-3 h-3 w-36" />
          </Panel>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel className="h-72" />
        <Panel className="h-72" />
      </section>
    </div>
  );
}
