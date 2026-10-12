/** One CSV cell. Text that starts with = + - @ (or a tab/CR) would run as a formula in Excel, so it is prefixed with ' (OWASP CSV injection). Plain numbers are left alone. */
export function csvCell(v: string | number): string {
  let t = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(t) && !/^[+-]?[\d,]*\.?\d+$/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}
