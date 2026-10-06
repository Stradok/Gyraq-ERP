"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, CircleDashed } from "lucide-react";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge, Mono } from "@/components/app/status";
import { KeyValue, SupplierLink, Totals, whCode } from "@/components/app/entity";
import { AiChip } from "@/components/app/ai";
import { ApprovalButtons } from "@/components/app/approval-actions";
import { Progress } from "@/components/ui/progress";
import { getDB, idx } from "@/lib/data/queries";
import { dateLong, dateShort, money, money2, num } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { cn } from "@/lib/utils";

export default function PODetail() {
  const { id } = useParams<{ id: string }>();
  const ov = useOverlay();
  const po = ov.pos.find((p) => p.id === id);
  if (!po) return <Page><p className="text-sm text-muted-foreground">Purchase order not found.</p></Page>;
  const db = getDB();
  const sup = idx().sup.get(po.supplierId)!;
  const approval = ov.approvals.find((a) => a.type === "purchase_order" && a.ref === po.id);
  const dec = approval ? ov.decisions[approval.id] : undefined;
  const grns = db.grns.filter((g) => g.poId === po.id);
  const bills = db.bills.filter((b) => b.poId === po.id);
  const recvPct = (po.lines.reduce((s, l) => s + l.received, 0) / Math.max(1, po.lines.reduce((s, l) => s + l.qty, 0))) * 100;
  const flow = ["Draft", "Pending approval", "Approved", "Received", "Billed"];
  const idxStep = po.status === "draft" ? 0 : po.status === "pending_approval" ? 1 : po.status === "approved" ? 2 : po.status === "partially_received" ? 2 : bills.length ? 4 : 3;
  const pending = approval && !dec && approval.status === "pending";
  const newlyApproved = ov.newlyApproved.some((p) => p.id === po.id);
  return (
    <>
      <PageHeader back={{ href: "/purchasing/orders", label: "Purchase orders" }} title={<span className="flex items-center gap-3"><Mono className="text-xl">{po.number}</Mono><StatusBadge status={po.status} />{po.source === "ai_proposal" && <AiChip label="AI-proposed" />}</span>}
        description={<span><SupplierLink id={po.supplierId} /> · ordered {dateLong(po.date)} · deliver to {whCode(po.warehouseId)} · expected {dateShort(po.expectedDate)}</span>} actions={pending && approval ? <ApprovalButtons approval={approval} /> : undefined} />
      <Page>
        <div className="flex flex-wrap items-center gap-1 text-xs">{flow.map((s, i) => (<div key={s} className="flex items-center gap-1"><span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", i <= idxStep ? "border-primary/40 bg-primary/10" : "text-muted-foreground")}>{i < idxStep ? <Check className="size-3 text-primary" /> : i === idxStep ? <CircleDashed className="size-3 text-primary" /> : null}{s}</span>{i < flow.length - 1 && <span className="h-px w-5 bg-border" />}</div>))}</div>
        {newlyApproved && (
          <div className="rounded-lg border border-success/40 bg-success/5 p-3.5 text-[13px]">
            <div className="mb-1 font-medium text-success">Approved. The ERP updated:</div>
            <ul className="grid gap-1 text-muted-foreground sm:grid-cols-2"><li>· <Link href="/inventory/replenishment" className="hover:text-foreground hover:underline">Inventory forecast</Link>: incoming stock +{num(po.lines.reduce((s, l) => s + l.qty, 0))} units</li><li>· <Link href="/finance/cashflow" className="hover:text-foreground hover:underline">Expected cash flow</Link>: payable {money(po.total)} around {dateShort(db.today.slice(0, 0) + po.expectedDate)} + {sup.termsDays}d</li><li>· <Link href={`/suppliers/${sup.id}`} className="hover:text-foreground hover:underline">Supplier commitments</Link>: +{money(po.total)}</li><li>· Notification sent to the requester; audit event recorded</li></ul>
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Lines" flush>
              <table className="w-full text-[13px]"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-2 font-medium">Product</th><th className="px-2 py-2 text-right font-medium">Ordered</th><th className="px-2 py-2 text-right font-medium">Received</th><th className="px-2 py-2 text-right font-medium">Unit price</th><th className="px-4 py-2 text-right font-medium">Value</th></tr></thead>
                <tbody>{po.lines.map((l, i) => { const p = idx().prod.get(l.productId)!; return <tr key={i} className="border-b last:border-0"><td className="px-4 py-2"><Link href={`/inventory/${p.id}`} className="hover:text-primary hover:underline">{p.name}</Link><div className="text-xs text-muted-foreground">{l.qty / p.cartonSize} cartons</div></td><td className="px-2 text-right tabular">{num(l.qty)}</td><td className="px-2 text-right tabular text-muted-foreground">{num(l.received)}</td><td className="px-2 text-right tabular">{money2(l.price)}</td><td className="px-4 text-right tabular font-medium">{money(l.qty * l.price)}</td></tr>; })}</tbody></table>
              <Totals rows={[{ label: "Subtotal", value: po.subtotal, muted: true }, { label: "Sales tax & advance tax (est.)", value: po.total - po.subtotal, muted: true }, { label: "PO total", value: po.total, strong: true }]} />
            </Section>
            <Section title="Goods receipts and bills" flush>
              {grns.length + bills.length === 0 ? <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing received or billed yet.</p> : <ul className="divide-y text-[13px]">{grns.map((g) => <li key={g.id} className="flex items-center justify-between px-4 py-2.5"><span><Mono>{g.number}</Mono><span className="ml-2 text-muted-foreground">received {dateShort(g.date)}</span></span><span className="tabular">{money(g.value)}</span></li>)}{bills.map((b) => <li key={b.id} className="flex items-center justify-between px-4 py-2.5"><Link href={`/purchasing/bills/${b.id}`} className="hover:text-primary"><Mono>{b.supplierInvoiceNo}</Mono><span className="ml-2 text-muted-foreground">bill {dateShort(b.date)}</span></Link><span className="flex items-center gap-2"><span className="tabular">{money(b.total)}</span><StatusBadge status={b.status} /></span></li>)}</ul>}
            </Section>
          </div>
          <div className="space-y-4">
            <Section title="Approval">
              {approval ? (
                <div className="space-y-2 text-[13px]">
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Required step</span><span>{approval.step}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Requested by</span><span>{approval.requestedBy}</span></div>
                  <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={dec ? dec.decision : approval.status} /></div>
                  {dec && <p className="text-xs text-muted-foreground">{dec.decision === "approved" ? "Approved" : "Rejected"} by {dec.by}</p>}
                  {pending && <div className="pt-1"><ApprovalButtons approval={approval} /></div>}
                </div>
              ) : <p className="text-[13px] text-muted-foreground">Approved automatically (within procurement limit).</p>}
            </Section>
            <Section title="Delivery"><div className="space-y-3 text-[13px]"><div><div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Received</span><span className="tabular">{recvPct.toFixed(0)}%</span></div><Progress value={recvPct} className="h-1.5" /></div><KeyValue cols={1} items={[["Expected", dateLong(po.expectedDate)], ["Supplier lead time", `${sup.leadTimeDays} days`], ["Payment terms", `${sup.termsDays} days`]]} /></div></Section>
          </div>
        </div>
      </Page>
    </>
  );
}
