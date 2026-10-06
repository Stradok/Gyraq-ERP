import { idx } from "@/lib/data/queries";
import type { SupplierBill } from "@/lib/data/types";
import { dateLong, money, money2, num } from "@/lib/format";

/** A rendered supplier-invoice "document" (what the extraction reads). */
export function InvoiceDoc({ bill, highlight = [] }: { bill: SupplierBill; highlight?: string[] }) {
  const sup = idx().sup.get(bill.supplierId)!;
  const hl = (k: string) => (highlight.includes(k) ? "bg-warning/25 ring-1 ring-warning/60 rounded px-0.5" : "");
  return (
    <div className="rounded-md border bg-white p-5 text-[11px] leading-snug text-neutral-800 shadow-sm">
      <div className="flex justify-between border-b border-neutral-200 pb-3">
        <div><div className="text-sm font-bold uppercase tracking-wide text-neutral-900">{sup.name}</div><div>{sup.city}, {sup.province}</div><div>NTN {sup.ntn} · STRN {sup.strn}</div></div>
        <div className="text-right"><div className="text-sm font-semibold">SALES TAX INVOICE</div><div>Invoice no: <b className={hl("invoiceNo")}>{bill.supplierInvoiceNo}</b></div><div>Date: <span className={hl("date")}>{dateLong(bill.date)}</span></div></div>
      </div>
      <div className="my-3 flex justify-between"><div><div className="text-neutral-500">Bill to</div><div className="font-medium">Meridian Distribution Co. (Pvt.) Ltd.</div><div>NTN 4271936-8</div></div><div className="text-right"><div className="text-neutral-500">Terms</div><div>{sup.termsDays} days</div></div></div>
      <table className="w-full"><thead><tr className="border-y border-neutral-300 text-left text-neutral-500"><th className="py-1">Description</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
        <tbody>{bill.lines.map((l, i) => <tr key={i} className="border-b border-neutral-100"><td className="py-1">{l.description}</td><td className="text-right">{num(l.qty)}</td><td className={`text-right ${hl("price" + i)}`}>{money2(l.price)}</td><td className="text-right">{money(l.total)}</td></tr>)}</tbody></table>
      <div className="mt-3 ml-auto w-48 space-y-0.5"><div className="flex justify-between"><span>Value excl. tax</span><span>{money(bill.subtotal)}</span></div><div className="flex justify-between"><span>Sales tax</span><span>{money(bill.tax)}</span></div><div className="flex justify-between"><span>Adv. income tax 236G</span><span>{money(bill.wht236g)}</span></div><div className="flex justify-between border-t border-neutral-300 pt-1 text-xs font-bold"><span>Total</span><span className={hl("total")}>{money(bill.total)}</span></div></div>
    </div>
  );
}
