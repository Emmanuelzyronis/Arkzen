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
    <div
      className="animate-pulse grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading settings.</span>

      <div className="space-y-3">
        <Panel>
          <Bar className="h-4 w-40" />
          <Bar className="mt-1.5 h-3 w-64" />
          <div className="mt-5 space-y-4">
            <Bar className="h-9 w-full rounded-lg" />
            <Bar className="h-20 w-full rounded-lg" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Bar className="h-9 w-full rounded-lg" />
              <Bar className="h-9 w-full rounded-lg" />
            </div>
          </div>
        </Panel>

        <Panel>
          <Bar className="h-4 w-36" />
          <Bar className="mt-1.5 h-3 w-56" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Bar key={i} className={`h-7 rounded-full ${i % 3 === 0 ? "w-20" : i % 3 === 1 ? "w-28" : "w-16"}`} />
            ))}
          </div>
        </Panel>

        <Panel>
          <Bar className="h-4 w-40" />
          <Bar className="mt-1.5 h-3 w-52" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Bar key={i} className={`h-7 rounded-full ${i % 2 === 0 ? "w-24" : "w-32"}`} />
            ))}
          </div>
        </Panel>

        <Bar className="h-9 w-28 rounded-lg" />
      </div>

      <div className="space-y-3">
        <Panel className="h-20" />
        <Panel className="h-36" />
      </div>
    </div>
  );
}
