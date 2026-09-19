"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className={cn(
        "relative inline-flex h-8 w-[62px] shrink-0 items-center rounded-full border border-line bg-surface-3 px-1 transition-colors",
        className,
      )}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-2 text-fg-muted">
        <Sun aria-hidden="true" className={cn("size-3.5", !dark && "text-brand")} />
        <Moon aria-hidden="true" className={cn("size-3.5", dark && "text-brand")} />
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "relative z-10 size-6 rounded-full bg-surface shadow-card transition-transform duration-200",
          dark ? "translate-x-[30px]" : "translate-x-0",
        )}
      />
    </button>
  );
}
