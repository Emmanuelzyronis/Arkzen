"use client";

export type ToastTone = "ok" | "err" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (toasts: Toast[]) => void;

/**
 * Module-level toast channel.
 *
 * Notices live outside the React tree on purpose: `router.refresh()` re-renders
 * the server tree, and component-local state would be lost exactly when the
 * operator needs confirmation of what just happened.
 */
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(toasts);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener(toasts);
  return () => listeners.delete(listener);
}

export function notify(message: string, tone: ToastTone = "ok"): void {
  const toast: Toast = { id: nextId++, message, tone };
  toasts = [...toasts, toast];
  emit();
  setTimeout(() => dismissToast(toast.id), tone === "err" ? 7000 : 5000);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}
