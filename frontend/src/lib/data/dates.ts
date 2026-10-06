// Business dates are plain YYYY-MM-DD strings in Asia/Karachi. All math is done in UTC to stay TZ-safe.
import type { ISODate } from "./types";

const DAY = 86_400_000;

export const parseISO = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
export const toISO = (ms: number): ISODate => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: ISODate, n: number): ISODate => toISO(parseISO(d) + n * DAY);
export const diffDays = (a: ISODate, b: ISODate) => Math.round((parseISO(a) - parseISO(b)) / DAY);
export const weekday = (d: ISODate) => new Date(parseISO(d)).getUTCDay(); // 0 = Sunday
export const monthKey = (d: ISODate) => d.slice(0, 7);
export const startOfMonth = (d: ISODate): ISODate => `${d.slice(0, 7)}-01`;

export function addMonths(d: ISODate, n: number): ISODate {
  const dt = new Date(parseISO(d));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return toISO(dt.getTime());
}

export function endOfMonth(d: ISODate): ISODate {
  return addDays(addMonths(startOfMonth(d), 1), -1);
}

/** Today's business date in Pakistan. Same result on server and browser (barring the midnight edge). */
export function todayPK(): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

/** Pakistani fiscal year runs July–June. 2026-10-06 → "FY26-27". */
export function fiscalYear(d: ISODate) {
  const y = +d.slice(0, 4);
  const start = +d.slice(5, 7) >= 7 ? y : y - 1;
  return { label: `FY${String(start).slice(2)}-${String(start + 1).slice(2)}`, start: `${start}-07-01`, end: `${start + 1}-06-30` };
}

export function fiscalQuarter(d: ISODate) {
  const m = +d.slice(5, 7);
  const q = Math.floor(((m + 5) % 12) / 3) + 1; // Jul–Sep = Q1
  return `Q${q} ${fiscalYear(d).label}`;
}
