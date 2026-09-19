"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, TriangleAlert, X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastTone = "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  /** Say what just happened, in plain language. `tone` defaults to success. */
  notify: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be called inside <ToastProvider>.");
  return api;
}

const DISMISS_AFTER_MS = 5_000;

/**
 * Every mutation in the app reports through here, so a person is never left
 * guessing whether their click took effect. The message names what happened —
 * "Marked as won", not "Success" — and matches the words on the button that
 * caused it.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback<ToastApi["notify"]>(
    (message, tone = "success") => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }]);
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        // Rendered last so it sits above the shell in both stacking and reading
        // order. `pointer-events-none` on the container keeps the page usable
        // underneath while a toast is on screen.
        className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
            className={cn(
              "animate-fade pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border px-3.5 py-3 text-[13px] shadow-panel",
              toast.tone === "error"
                ? "border-line bg-down-bg text-fg"
                : "border-line bg-surface text-fg",
            )}
          >
            {toast.tone === "error" ? (
              <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0 text-down" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="mt-px size-4 shrink-0 text-brand" />
            )}
            <span className="min-w-0 flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
