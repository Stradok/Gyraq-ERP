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

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Natural-language period → inclusive date range. Weeks start Monday; quarters follow the Jul–Jun fiscal year. */
export function resolvePeriod(phrase: string, today: ISODate): { from: ISODate; to: ISODate; label: string } | null {
  const s = phrase.toLowerCase().trim();
  const dow = (weekday(today) + 6) % 7; // Mon=0
  const monthStartOf = (back: number) => { const d = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1 - back, 1)); return toISO(d.getTime()); };
  const r = (from: ISODate, to: ISODate, label: string) => ({ from, to: to > today ? today : to, label });
  if (/\btoday\b/.test(s)) return r(today, today, "today");
  if (/yesterday/.test(s)) return r(addDays(today, -1), addDays(today, -1), "yesterday");
  if (/last week|previous week/.test(s)) { const mon = addDays(today, -dow - 7); return r(mon, addDays(mon, 6), "last week (Mon–Sun)"); }
  if (/this week/.test(s)) return r(addDays(today, -dow), today, "this week (Mon to today)");
  if (/last month|previous month/.test(s)) return r(monthStartOf(1), addDays(monthStartOf(0), -1), "last month");
  if (/this month|month to date|mtd/.test(s)) return r(monthStartOf(0), today, "this month to date");
  const q = (back: number) => { const m = +today.slice(5, 7), fyStart = m >= 7 ? +today.slice(0, 4) : +today.slice(0, 4) - 1; const qi = Math.floor(((m + 5) % 12) / 3) - back; const yOff = Math.floor(qi / 4), qq = ((qi % 4) + 4) % 4; const sm = 6 + qq * 3; const from = toISO(Date.UTC(fyStart + yOff, sm, 1)); const to = toISO(Date.UTC(fyStart + yOff, sm + 3, 0)); return r(from, to, `Q${qq + 1} FY${String(fyStart + yOff).slice(2)}-${String(fyStart + yOff + 1).slice(2)}`); };
  if (/last quarter|previous quarter/.test(s)) return q(1);
  if (/this quarter|current quarter/.test(s)) return q(0);
  const fy = fiscalYear(today);
  if (/last (fiscal )?(year|fy)|previous (fiscal )?(year|fy)/.test(s) && /fiscal|fy/.test(s)) return r(addDays(fy.start, -365).slice(0, 4) + "-07-01", fy.start.slice(0, 4) + "-06-30", "last fiscal year");
  if (/(this )?(fiscal year|fy)|year to date|ytd/.test(s)) return r(fy.start, today, `${fy.label} to date`);
  const n = s.match(/last (\d+) (day|week|month)s?/);
  if (n) { const k = +n[1]!; return r(addDays(today, -(n[2] === "day" ? k - 1 : n[2] === "week" ? k * 7 - 1 : k * 30 - 1)), today, `last ${k} ${n[2]}s`); }
  const mi = MONTHS.findIndex((m) => s.includes(m));
  if (mi >= 0) { const yr = +(s.match(/\b(20\d\d)\b/)?.[1] ?? (mi + 1 > +today.slice(5, 7) ? +today.slice(0, 4) - 1 : +today.slice(0, 4))); const from = toISO(Date.UTC(yr, mi, 1)); return r(from, toISO(Date.UTC(yr, mi + 1, 0)), `${MONTHS[mi]} ${yr}`); }
  return null;
}
