// Pakistan-first formatting. Money is always explicit-decimals; compact form uses lakh/crore for KPI tiles.
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (n: number) => nf0.format(Math.round(n));
export const money = (n: number, dp = 0) => `${n < 0 ? "−" : ""}Rs ${(dp ? nf2 : nf0).format(Math.abs(dp ? n : Math.round(n)))}`;
export const money2 = (n: number) => money(n, 2);

/** Rs 1.23 Cr / Rs 12.3 L / Rs 45,000 */
export function moneyCompact(n: number) {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e7) return `${s}Rs ${(a / 1e7).toFixed(a >= 1e8 ? 1 : 2)} Cr`;
  if (a >= 1e5) return `${s}Rs ${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)} L`;
  return `${s}Rs ${nf0.format(Math.round(a))}`;
}
/** Rs 12.3M style, for charts */
export function moneyM(n: number) {
  const a = Math.abs(n), s = n < 0 ? "−" : "";
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)}K`;
  return `${s}${Math.round(a)}`;
}
export const pct = (n: number, dp = 1) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(dp)}%`;
export const pct0 = (n: number, dp = 1) => `${n.toFixed(dp)}%`;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dateShort = (d: string) => `${d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;
export const dateLong = (d: string) => `${d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
export const monthLabel = (m: string) => `${MON[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
export const timeShort = (iso: string) => iso.slice(11, 16);
export function relDate(d: string, today: string) {
  const n = Math.round((Date.parse(today) - Date.parse(d)) / 86_400_000);
  return n === 0 ? "Today" : n === 1 ? "Yesterday" : n > 0 && n < 8 ? `${n}d ago` : dateShort(d);
}
export const initials = (n: string) => n.split(" ").filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase();
export const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
