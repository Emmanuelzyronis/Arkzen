import { cn } from "@/lib/utils";

/**
 * Form controls, matching the reference's hairline-and-soft-radius language.
 *
 * They deliberately do not use `SelectTrigger`'s pill radius: a pill reads as a
 * button that opens something, whereas these are places to type. A small radius
 * is the difference between "press me" and "write here".
 */

const FIELD =
  "w-full rounded-tile border border-line bg-surface px-3 text-[13px] text-fg transition-colors placeholder:text-fg-muted focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-55";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(FIELD, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(FIELD, "min-h-20 resize-y py-2 leading-relaxed", className)} {...props} />;
}

/**
 * A label, an optional hint, and the control.
 *
 * Wired by `htmlFor` rather than by wrapping, so the hint text is not read out
 * as part of the field's name.
 */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[12px] font-medium text-fg-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[12px] text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] leading-relaxed text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
