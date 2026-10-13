// Money is kept as numbers on the cent grid (two decimals). Every operation that can produce a fraction of a cent goes through r2,
// which rounds the DECIMAL value half away from zero. The old Math.round(n * 100) / 100 rounded 1.005 down to 1.00 because
// 1.005 * 100 is 100.49999999999999 in binary floating point. Values stay exact to the paisa for amounts up to about 90 trillion.
// ponytail: not arbitrary precision. Switch to integer paisa or a decimal library if a currency with 3+ decimals or amounts beyond 1e13 are needed.
export const r2 = (n: number): number => {
  if (!Number.isFinite(n) || Math.abs(n) >= 1e13) return n;
  const v = Math.abs(n);
  const cents = Math.round(Number(`${Number(v.toFixed(9))}e2`)); // toFixed(9) drops binary noise (1.0049999999999999 is really 1.005)
  const out = Number(`${cents}e-2`);
  return n < 0 ? -out : out;
};
