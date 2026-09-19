"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { unitFor, yTicks, type Unit } from "@/lib/charts";

export interface Point {
  label: string;
  value: number;
}

/* ------------------------------------------------------------------ *
 * Shared frame: y-axis labels and grid as HTML, plot geometry as SVG,  *
 * so text stays crisp at any container width.                          *
 * ------------------------------------------------------------------ */

function Callout({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium leading-tight text-fg shadow-panel",
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Daily bars — the reference's "Net Revenue" chart.                    *
 * ------------------------------------------------------------------ */

export function BarChart({
  data,
  height = 190,
  unit = "",
  defaultActive,
}: {
  data: Point[];
  height?: number;
  /** What the values count. See `Unit` — a pair, never a function. */
  unit?: Unit;
  /**
   * The column whose callout is shown before anyone hovers.
   *
   * The reference keeps a callout standing on the busiest column, so the peak
   * reads without interaction. Hovering still wins and takes it away again —
   * this is a resting state, not a lock.
   */
  defaultActive?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? (defaultActive !== undefined && data[defaultActive] ? defaultActive : null);
  const reduce = useReducedMotion();
  const max = Math.max(1, ...data.map((point) => point.value));
  const ticks = yTicks(max);
  // Framer cannot tween 0 -> "45%"; bar heights are computed in px instead.
  const barHeight = (value: number) => Math.max(3, Math.round((value / max) * height));

  if (data.length === 0) {
    return <p className="py-10 text-center text-[13px] text-fg-muted">Nothing recorded in this period.</p>;
  }

  return (
    <div className="relative">
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col justify-between pb-6 text-right text-[11px] tabular-nums text-fg-muted">
          {[...ticks].reverse().map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => (
              <span key={tick} className="h-px w-full bg-line" />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end gap-[6px]">
            {data.map((point, index) => (
              <button
                key={`${point.label}-${index}`}
                type="button"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(index)}
                onBlur={() => setHovered(null)}
                className="group relative flex h-full flex-1 items-end"
                aria-label={`${point.label}: ${point.value}${unitFor(unit, point.value)}`}
              >
                <motion.span
                  initial={reduce ? false : { height: 0 }}
                  animate={{ height: barHeight(point.value) }}
                  transition={{ duration: 0.5, delay: index * 0.02, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    "w-full rounded-t-[4px]",
                    active === index ? "bg-brand-bright" : "bg-brand/85",
                  )}
                />
              </button>
            ))}
          </div>
          {active !== null && (
            <Callout
              className="top-0 whitespace-nowrap"
              style={{ left: `${((active + 0.5) / data.length) * 100}%` }}
            >
              <span className="block text-fg-muted">{data[active].label}</span>
              {data[active].value}
              {unitFor(unit, data[active].value)}
            </Callout>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-3">
        <span className="w-9 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-between text-[11px] text-fg-muted">
          {data.map((point, index) => (
            <span key={`${point.label}-label-${index}`} className="truncate">
              {point.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Trend lines — the reference's "Rates" chart.                         *
 * ------------------------------------------------------------------ */

export function TrendChart({
  labels,
  series,
  height = 190,
  suffix = "%",
  defaultActive,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  height?: number;
  suffix?: string;
  /** The column whose callout is shown before anyone hovers — see `BarChart`. */
  defaultActive?: number;
}) {
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const active = hovered ?? (defaultActive !== undefined && labels[defaultActive] ? defaultActive : null);
  const reduce = useReducedMotion();
  const max = Math.max(1, ...series.flatMap((entry) => entry.values));
  const ticks = yTicks(max);
  const width = 100;
  const pointAt = (values: number[], index: number) => {
    const x = labels.length <= 1 ? width / 2 : (index / (labels.length - 1)) * width;
    const y = 100 - (values[index] / max) * 100;
    return [x, y] as const;
  };

  return (
    <div className="relative">
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col justify-between pb-6 text-right text-[11px] tabular-nums text-fg-muted">
          {[...ticks].reverse().map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div
          className="relative min-w-0 flex-1"
          style={{ height }}
          onMouseLeave={() => setHovered(null)}
        >
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((tick) => (
              <span key={tick} className="h-px w-full bg-line" />
            ))}
          </div>
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
            aria-hidden="true"
          >
            <defs>
              {series.map((entry, index) => (
                <linearGradient key={entry.name} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={entry.color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={entry.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            {series.map((entry, index) => {
              const line = entry.values
                .map((_, i) => pointAt(entry.values, i).join(","))
                .join(" ");
              const area = `0,100 ${line} 100,100`;
              return (
                <g key={entry.name}>
                  {index === 0 && <polygon points={area} fill={`url(#${gradientId}-${index})`} />}
                  <motion.polyline
                    points={line}
                    fill="none"
                    stroke={entry.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                </g>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex">
            {labels.map((label, index) => (
              <button
                key={`${label}-${index}`}
                type="button"
                onMouseEnter={() => setHovered(index)}
                onFocus={() => setHovered(index)}
                className="h-full flex-1"
                aria-label={label}
              />
            ))}
          </div>
          {active !== null && (
            <Callout
              className="top-0 whitespace-nowrap"
              style={{
                left: `${((active + 0.5) / Math.max(1, labels.length)) * 100}%`,
              }}
            >
              <span className="block text-fg-muted">{labels[active]}</span>
              {series.map((entry) => (
                <span key={entry.name} className="block tabular-nums">
                  {entry.values[active]}
                  {suffix} {entry.name}
                </span>
              ))}
            </Callout>
          )}
        </div>
      </div>
      <div className="mt-2 flex gap-3">
        <span className="w-9 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-between text-[11px] text-fg-muted">
          {labels.map((label, index) => (
            <span key={`${label}-x-${index}`} className="truncate">
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 pl-12">
        {series.map((entry) => (
          <span key={entry.name} className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Funnel — the reference's "Sales conversion" card.                    *
 * ------------------------------------------------------------------ */

export function FunnelChart({
  data,
  height = 224,
}: {
  data: { label: string; sub: string; value: number }[];
  height?: number;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...data.map((step) => step.value));
  const first = data[0]?.value ?? 0;
  // Everything under the bars: the share figure and its gap (~24px), the stage
  // name's two-line slot (~30px), the count (~14px) and the gap above it
  // (~10px). A constant, not a per-column measurement — see the name's slot
  // below for why every column reserves the same two lines whether or not it
  // uses them.
  const CAPTION = 78;
  const bars = Math.max(40, height - CAPTION);

  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {data.map((step, index) => {
        const share = first > 0 ? Math.round((step.value / first) * 100) : 0;
        return (
          <div key={step.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="mb-2 text-[11px] font-medium tabular-nums text-fg-muted">{share}%</span>
            <motion.span
              initial={reduce ? false : { height: 0 }}
              animate={{ height: Math.max(4, Math.round((step.value / max) * bars)) }}
              transition={{ duration: 0.5, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="w-full rounded-t-[4px] bg-brand"
            />
            <div className="mt-2.5 w-full min-w-0 text-center">
              {/* The stage name wraps; it does not truncate. Five columns share
                  one card, and on a phone that is 55px each — narrower than
                  "Reached out", which used to render as "Reached o…". A stage
                  nobody can read is a stage that is not there.
                  The height is reserved whether or not the name needs it, and
                  is reserved *here* rather than measured per column: the bars
                  are anchored to the bottom of a fixed-height box, so a column
                  that reserved one line would sit its bar 15px lower than the
                  column beside it, and the funnel's whole point is that the
                  bars are comparable. `w-full` is load-bearing for the same
                  reason as the slot — the column centres its children, so
                  without it this box is only as wide as its own text and wraps
                  at that width rather than at the column's. */}
              <div className="flex h-[30px] w-full items-center justify-center text-[12px] font-medium leading-tight text-fg">
                {step.label}
              </div>
              <div className="truncate text-[11px] tabular-nums text-fg-muted">{step.sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Gauge — the reference's "Sessions" dial.                             *
 * ------------------------------------------------------------------ */

export function Gauge({
  value,
  caption,
  max = 100,
}: {
  value: number;
  caption: string;
  max?: number;
}) {
  const reduce = useReducedMotion();
  const clamped = Math.max(0, Math.min(value, max));
  const length = Math.PI * 70;
  const offset = length * (1 - clamped / max);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 160 92" role="img" aria-label={`${caption}: ${value} of ${max}`} className="w-full max-w-[240px]">
        <path
          d="M 10 80 A 70 70 0 0 1 150 80"
          fill="none"
          stroke="var(--line)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <motion.path
          d="M 10 80 A 70 70 0 0 1 150 80"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={length}
          initial={reduce ? false : { strokeDashoffset: length }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        <text x="80" y="74" textAnchor="middle" className="fill-fg text-[34px] font-semibold tabular-nums">
          {value}
        </text>
      </svg>
      <p className="mt-1 text-[13px] text-fg-muted">{caption}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Segmented column — the reference's "Peak revenue times" strip.        *
 * ------------------------------------------------------------------ */

export function SegmentedColumn({
  segments,
  activeIndex,
  callout,
  height = 190,
}: {
  segments: { label: string; value: number }[];
  activeIndex: number;
  callout: React.ReactNode;
  height?: number;
}) {
  const reduce = useReducedMotion();
  const max = Math.max(1, ...segments.map((segment) => segment.value));

  return (
    <div className="relative flex items-stretch gap-2" style={{ height }}>
      <div className="flex w-full flex-col justify-between gap-[3px]">
        {segments.map((segment, index) => (
          <motion.span
            key={`${segment.label}-${index}`}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: index * 0.04 }}
            className={cn(
              "w-full rounded-full",
              index === activeIndex ? "bg-brand" : "bg-line-strong",
            )}
            style={{ height: `${Math.max(6, (segment.value / max) * 16)}px` }}
            title={`${segment.label}: ${segment.value}`}
          />
        ))}
      </div>
      <Callout
        className="right-0 top-0 translate-x-0 whitespace-nowrap"
        style={{ top: `${(activeIndex / Math.max(1, segments.length)) * 100}%` }}
      >
        {callout}
      </Callout>
    </div>
  );
}
