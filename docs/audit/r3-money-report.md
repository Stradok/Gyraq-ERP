# R3: exact money, differences report

**What changed.** All four copies of the rounding function (`engines.ts`, `engine/core.ts`, `data/sim.ts`, `integrations/fbr.ts`) are replaced by one, `frontend/src/lib/money.ts` `r2`. It rounds the *decimal* value half away from zero. The old `Math.round(n * 100) / 100` rounded 1.005 down to 1.00 (1.005 × 100 = 100.49999999999999 in binary) and 2.675 to 2.67.
**What did not change.** Amounts are still numbers with two decimals; every step re-rounds to the cent so sums cannot drift (a 200,000-addition test shows exactly zero drift against a BigInt reference). Postgres columns are `numeric(18,2)`. This is exact to the paisa up to about 90 trillion rupees, not arbitrary precision (noted in `money.ts`). Switching to integer paisa or a decimal library would change every engine and query file for no visible gain at this scale.

## Effect on the seeded company (5,574 invoices, 3,423 bills, 83,694 journal lines), old vs exact rounding
| | Changed | Size |
|---|---|---|
| Invoices | 74 of 5,574 (1.3%) | 1 to 16 rupees; total across all 74 = Rs 34.74 on billions invoiced |
| Supplier bills | 0 of 3,423 | none |
| Journal lines | 1,156 of 83,694 | follow the invoice differences |
| Entries | same count | books still balance (engine and backend suites pass) |

Why a few invoices move by more than a paisa: the pricing rule rounds the **unit price** to the paisa and then multiplies by the quantity, so a one-paisa change in a unit price becomes Rs 15.98 on INV-13239 (a large carton quantity). That is the existing pricing rule (round per unit, then multiply), not a new rounding bug. If you would rather price on the line total, say so; it is a one-line change in `priceLine` and moves different invoices.

## Verification
- `pnpm test:unit`: 20,000 random decimals rounded identically to a BigInt half-up reference; known traps (1.005, 2.675, 0.1 + 0.2, negatives) correct; 200,000 additions drift by zero.
- Engine, empty-company and backend suites pass, including trial balance, receivables and inventory reconciliation on the new seed.
- **Existing databases:** documents already stored keep their stored amounts (nothing is recalculated); only new documents use the new rounding. The demo seed differs slightly from before for the 74 invoices above.
