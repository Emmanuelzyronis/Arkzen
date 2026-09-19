/**
 * Calendar grid maths, with no DOM in it.
 *
 * The reference's sheet starts the week on Monday and always draws six rows, so
 * the panel doesn't change height as you page through months.
 */

/** Monday first, matching the reference's sheet. */
export const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export interface DayCell {
  date: Date;
  /** False for the leading and trailing days borrowed from the neighbouring months. */
  inMonth: boolean;
  /** `YYYY-MM-DD`, for comparing against a selected range. */
  key: string;
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The first Monday on or before the 1st of the month. */
function gridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-based; shift so Monday is 0.
  const offset = (first.getDay() + 6) % 7;
  return new Date(year, month, 1 - offset);
}

/** Six weeks of days covering `month`, including the overlap either side. */
export function monthGrid(year: number, month: number): DayCell[] {
  const start = gridStart(year, month);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, inMonth: date.getMonth() === month, key: dayKey(date) };
  });
}

/** The month before or after `year`/`month`, rolling the year over correctly. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}
