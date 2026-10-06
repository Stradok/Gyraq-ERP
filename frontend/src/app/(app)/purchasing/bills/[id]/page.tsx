"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { AiChip, ConfidenceBadge } from "@/components/app/ai";
import { Mono, StatusBadge } from "@/components/app/status";
import { KeyValue, SupplierLink, whCode } from "@/components/app/entity";
import { InvoiceDoc } from "@/components/app/doc-preview";
import { getDB, idx } from "@/lib/data/queries";
import { dateLong, money, money2, num, titleCase } from "@/lib/format";
import { useERP } from "@/lib/store";
import { PERSONAS, can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const { role, decisions, decide, addAudit } = useERP();
  const [comment, setComment] = useState("");
  const db = getDB();
  const b = db.bills.find((x) => x.id === id);
  if (!b) return <Page><p className="text-sm text-muted-foreground">Bill not found.</p></Page>;
  const po = b.poId ? db.pos.find((p) => p.id === b.poId) : null;
  const grn = po ? db.grns.find((g) => g.poId === po.id) : null;
  const sup = idx().sup.get(b.supplierId)!;
  const d = decisions[`bill_${b.id}`];
  const status = d ? (d.decision === "approved" ? "posted" : "rejected") : b.status;
  const variance = b.exceptions.filter((e) => e.type === "PRICE_VARIANCE").reduce((s, e) => s + e.variance, 0);
  const isDup = b.exceptions.some((e) => e.type === "DUPLICATE_BILL");
  const orig = isDup ? db.bills.find((x) => x.supplierId === b.supplierId && x.id !== b.id && Math.abs(x.total - b.total) < 1) : null;
  const me = PERSONAS.find((p) => p.role === role)!;
  const act = (decision: "approved" | "rejected", label: string) => {
    decide(`bill_${b.id}`, { decision, at: new Date().toISOString(), by: me.name, comment });
    addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor: me.name, action: decision === "approved" ? "supplier_bill.variance_approved" : "supplier_bill.rejected", entity: "Supplier bill", ref: b.supplierInvoiceNo, source: b.source === "ai_extraction" ? "ai_proposal" : "user", detail: `${label}${comment ? `: ${comment}` : ""}` });
    toast.success(label, { description: decision === "approved" ? "Journal posted: Dr GRNI, Purchase price variance, Input tax; Cr Trade creditors." : undefined });
  };
  const pending = (b.status === "exception" || b.status === "pending_match") && !d;
  const canAct = can(role, "approve.finance");
  return (
    <>
      <PageHeader back={{ href: "/purchasing/bills", label: "Supplier bills" }} title={<span className="flex items-center gap-3"><Mono className="text-xl">{b.supplierInvoiceNo}</Mono><StatusBadge status={status} />{b.source === "ai_extraction" && <AiChip label="Extracted" />}</span>}
        description={<span><SupplierLink id={b.supplierId} /> · billed {dateLong(b.date)} · due {dateLong(b.dueDate)} · {money(b.total)}</span>} />
      <Page>
        {b.exceptions.length > 0 && (
          <div className="rounded-lg border bg-card p-4" style={{ borderLeft: "2px solid var(--ai)" }}>
            <div className="mb-1 flex items-center gap-2 text-sm font-medium"><AlertTriangle className="size-4 text-warning" />{isDup ? "Possible duplicate invoice" : `AI detected a ${((variance / (po?.subtotal || 1)) * 100).toFixed(1)}% price variance on ${b.exceptions.filter((e) => e.type === "PRICE_VARIANCE").length} products`}<AiChip label="Detected" /></div>
            {po && !isDup && <p className="text-[13px] text-muted-foreground">Invoice total {money(b.subtotal)} vs PO {money(po.subtotal)} (excl. tax): difference {money(variance)}. Approval is required before posting.</p>}
            {isDup && orig && <p className="text-[13px] text-muted-foreground">{b.supplierInvoiceNo} has the same total ({money(b.total)}) as {orig.supplierInvoiceNo} dated {dateLong(orig.date)}; invoice numbers differ by one character.</p>}
            <div className="mt-2"><ConfidenceBadge level={isDup ? "medium" : "high"} basis="Three-way match + 90-day price history" /></div>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Three-way match" description={po && grn ? `${po.number} ↔ ${grn.number} ↔ ${b.supplierInvoiceNo}` : "No purchase order or receipt linked"} flush>
              <div className="overflow-x-auto"><table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">PO price</th><th className="px-2 py-2 text-right font-medium">Received</th><th className="px-2 py-2 text-right font-medium">Billed qty</th><th className="px-2 py-2 text-right font-medium">Billed price</th><th className="px-4 py-2 text-right font-medium">Variance</th></tr></thead>
                <tbody>{b.lines.map((l, i) => {
                  const pl = po?.lines.find((x) => x.productId === l.productId);
                  const gl = grn?.lines.find((x) => x.productId === l.productId);
                  const v = pl ? (l.price - pl.price) * l.qty : 0;
                  return <tr key={i} className="border-b last:border-0"><td className="px-4 py-2">{l.description}</td><td className="px-2 text-right tabular">{pl ? money2(pl.price) : "—"}</td><td className="px-2 text-right tabular">{gl ? num(gl.qty) : "—"}</td><td className="px-2 text-right tabular">{num(l.qty)}</td><td className={cn("px-2 text-right tabular", v > 1 && "font-medium text-danger")}>{money2(l.price)}</td><td className={cn("px-4 text-right tabular", v > 1 ? "text-danger" : "text-muted-foreground")}>{v > 1 ? `+${money(v)}` : "—"}</td></tr>;
                })}</tbody></table></div>
            </Section>
            {b.exceptions.length > 0 && <Section title="Exceptions" flush><ul className="divide-y text-[13px]">{b.exceptions.map((e, i) => <li key={i} className="flex gap-3 px-4 py-2.5"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-danger" /><div><div className="font-medium">{titleCase(e.type.toLowerCase())}</div><div className="text-xs text-muted-foreground">{e.note}{e.variance ? ` · ${money(e.variance)}` : ""}</div></div></li>)}</ul></Section>}
            {isDup && orig && <Section title="Compare with earlier bill"><div className="grid gap-3 sm:grid-cols-2"><div><div className="mb-1 text-xs text-muted-foreground">Earlier · posted</div><InvoiceDoc bill={orig} highlight={["total"]} /></div><div><div className="mb-1 text-xs text-muted-foreground">This bill · pending</div><InvoiceDoc bill={b} highlight={["invoiceNo", "total"]} /></div></div></Section>}
            <Section title="Accounting on approval" description="Journal that will post" flush>
              <table className="w-full text-[13px]"><tbody>
                {[["2020", "Goods received not invoiced", Math.min(grn?.value ?? b.subtotal, b.subtotal), 0], ["5030", "Purchase price variance", Math.max(0, b.subtotal - (grn?.value ?? b.subtotal)), 0], ["1400", "Input sales tax", b.tax, 0], ["1410", "Advance income tax u/s 236G", b.wht236g, 0], ["2010", "Trade creditors (AP)", 0, b.total]].filter((r) => (r[2] as number) || (r[3] as number)).map((r) => <tr key={String(r[0])} className="border-b last:border-0"><td className="px-4 py-2"><Mono className="mr-2 text-muted-foreground">{r[0]}</Mono>{r[1]}</td><td className="w-32 px-4 text-right tabular">{r[2] ? money(r[2] as number) : ""}</td><td className="w-32 px-4 text-right tabular">{r[3] ? money(r[3] as number) : ""}</td></tr>)}
              </tbody></table>
            </Section>
          </div>
          <div className="space-y-4">
            {pending && (
              <Section title="Resolve">
                <div className="space-y-3">
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Reason (recorded in the audit log)" className="min-h-20 text-[13px]" />
                  {canAct ? <div className="flex flex-col gap-2">
                    {!isDup && <Button onClick={() => act("approved", "Approved with price variance")}><Check />Approve with variance</Button>}
                    {!isDup && <Button variant="outline" onClick={() => { toast.info("Simulated: credit-note request sent to supplier", { description: "Email stored in the outbox; nothing was sent." }); }}>Request credit note</Button>}
                    <Button variant={isDup ? "default" : "outline"} onClick={() => act("rejected", isDup ? "Rejected as duplicate" : "Bill rejected")}>{isDup ? "Reject as duplicate" : "Reject bill"}</Button>
                    {isDup && <Button variant="outline" onClick={() => act("approved", "Approved (not a duplicate)")}>Not a duplicate: approve</Button>}
                  </div> : <p className="text-xs text-muted-foreground">Needs Finance Manager or Owner. Switch persona to try it.</p>}
                </div>
              </Section>
            )}
            {d && <Section title="Decision"><p className="text-[13px]">{d.decision === "approved" ? "Approved" : "Rejected"} by <b>{d.by}</b>{d.comment ? `: “${d.comment}”` : ""}</p></Section>}
            <Section title="Bill details"><KeyValue cols={1} items={[["Supplier", <SupplierLink key="s" id={sup.id} />], ["Supplier NTN / STRN", `${sup.ntn} · ${sup.strn}`], ["Subtotal", money(b.subtotal)], ["Sales tax", money(b.tax)], ["Advance tax 236G", money(b.wht236g)], ["Total payable", money(b.total)], ["Receiving warehouse", grn ? whCode(grn.warehouseId) : "—"], ["Internal number", <Mono key="n">{b.number}</Mono>]]} /></Section>
            {!isDup && <Section title="Document"><InvoiceDoc bill={b} highlight={b.exceptions.filter((e) => e.type === "PRICE_VARIANCE").map((_, i) => `price${i}`)} /></Section>}
          </div>
        </div>
      </Page>
    </>
  );
}
