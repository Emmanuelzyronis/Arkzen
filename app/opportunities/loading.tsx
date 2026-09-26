function Bar({ className }: { className?: string }) {
  return <span className={`block rounded-full bg-surface-3 ${className ?? ""}`} />;
}

function Panel({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-surface shadow-card ${className ?? ""}`}>
      {children}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading opportunities.</span>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-1">
        <div>
          <Bar className="h-4 w-36" />
          <Bar className="mt-2 h-3 w-52" />
        </div>
        <div className="flex items-center gap-4">
          <Bar className="h-3 w-32" />
          <Bar className="h-7 w-24 rounded-lg" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Bar className="h-8 w-40 rounded-lg" />
        </div>
        <Panel>
          <div className="flex items-center gap-4 border-b border-line px-4 py-3">
            <Bar className="h-3 flex-1" />
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-16" />
          </div>
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-line px-4 py-3.5 last:border-0">
              <div className="flex-1 space-y-2">
                <Bar className="h-3 w-3/4" />
                <Bar className="h-2.5 w-2/5" />
              </div>
              <Bar className="h-3 w-20" />
              <Bar className="h-3 w-24" />
              <Bar className="h-3 w-16" />
              <Bar className="h-3 w-14" />
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
