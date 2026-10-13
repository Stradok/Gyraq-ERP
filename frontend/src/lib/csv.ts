/** One CSV cell. Text that starts with = + - @ (or a tab/CR) would run as a formula in Excel, so it is prefixed with ' (OWASP CSV injection). Plain numbers are left alone. */
export function csvCell(v: string | number): string {
  let t = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(t) && !/^[+-]?[\d,]*\.?\d+$/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}

/** RFC 4180 reader: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF or LF. Blank lines are skipped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  const end = () => { row.push(cell); cell = ""; if (row.some((c) => c.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n") end(); else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length) end();
  return rows;
}
