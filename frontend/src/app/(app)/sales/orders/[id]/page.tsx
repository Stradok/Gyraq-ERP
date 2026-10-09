"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, CircleDashed, PackageCheck, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DispatchDialog } from "@/components/app/dispatch-dialog";
import { Progress } from "@/components/ui/progress";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge, Mono } from "@/components/app/status";
import { CustomerLink, KeyValue, LinesTable, Totals, empName, whCode } from "@/components/app/entity";
import { customerStats, getDB, idx } from "@/lib/data/queries";
import { docTotals } from "@/lib/engines";
import { run } from "@/lib/engine/client";
import { dateLong, money } from "@/lib/format";
import { useWorld, useERP } from "@/lib/store";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const STEPS = ["Draft", "Confirmed", "Picked", "Dispatched", "Invoiced"] as const;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  useWorld((s) => s.version);
  const role = useERP((s) => s.role);
  const [dispatch, setDispatch] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const db = getDB();
  const so = db.orders.find((o) => o.id === id);
  if (!so) return <Page><p className="text-sm text-muted-foreground">Order not found.</p></Page>;
  const c = idx().cus.get(so.customerId)!;
  const s = customerStats(c.id);
  const t = docTotals(so.lines, c);
  const inv = so.invoiceId ? idx().inv.get(so.invoiceId) : null;
  const sh = db.shipments.find((x) => x.orderId === so.id);
  const cc = so.creditCheck;
  const open = so.status === "confirmed" || so.status === "reserved";
  const stepIdx = so.status === "draft" ? 0 : so.status === "cancelled" ? -1 : so.status === "fulfilled" ? 4 : so.picked ? 2 : 1;
  const hasOverride = db.approvals.some((a) => a.type === "credit_override" && a.ref === so.id && a.status === "pending");
  const util = cc ? Math.min(100, (cc.exposure / cc.limit) * 100) : Math.min(100, (s.outstanding / c.creditLimit) * 100);
  const ops = can(role, "warehouse.ops"), sales = can(role, "order.create");
  return (
    <>
      <PageHeader back={{ href: "/sales/orders", label: "Orders" }} title={<span className="flex items-center gap-3"><Mono className="text-xl">{so.number}</Mono><StatusBadge status={so.status} />{so.picked && open && <StatusBadge status="approved" label="Picked" />}{so.source === "ai_proposal" && <span className="text-xs text-ai">AI-proposed</span>}</span>}
        description={<span><CustomerLink id={c.id} /> · {dateLong(so.date)} · booked by {empName(so.repId)} · ships from {whCode(so.warehouseId)}</span>}
        actions={<>
          {so.status === "draft" && sales && cc?.decision !== "block" && <Button size="sm" onClick={() => run("ConfirmOrder", { orderId: so.id })}><Check />Confirm order</Button>}
          {so.status === "draft" && sales && cc?.decision === "block" && !hasOverride && <Button size="sm" onClick={() => run("RequestCreditOverride", { orderId: so.id })}>Request credit override</Button>}
          {so.status === "draft" && hasOverride && <StatusBadge status="pending" label="Override pending" />}
          {open && !so.picked && ops && <Button size="sm" onClick={() => run("PickOrder", { orderId: so.id })}><PackageCheck />Mark picked</Button>}
          {open && so.picked && ops && <Button size="sm" onClick={() => setDispatch(true)}><Truck />Dispatch</Button>}
          {(so.status === "draft" || open) && sales && <Button size="sm" variant="outline" onClick={() => setCancel(true)}>Cancel order</Button>}
          {inv && <Button size="sm" variant="outline" asChild><Link href={`/sales/invoices/${inv.id}`}>Invoice {inv.number}</Link></Button>}
          {sh && <Button size="sm" variant="outline" asChild><Link href={`/sales/shipments/${sh.id}`}>Challan {sh.number}</Link></Button>}
        </>} />
      <DispatchDialog orderId={so.id} open={dispatch} onOpenChange={setDispatch} />
      <Dialog open={cancel} onOpenChange={setCancel}>
        <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Cancel {so.number}?</DialogTitle><DialogDescription>Reserved stock is released. This can't be undone.</DialogDescription></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audited)" aria-label="Reason" />
          <DialogFooter><Button variant="ghost" onClick={() => setCancel(false)}>Keep order</Button><Button variant="destructive" disabled={reason.trim().length < 3} onClick={() => { const r = run("CancelOrder", { orderId: so.id, reason }); if (r.ok) setCancel(false); }}>Cancel order</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Page>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {STEPS.map((st, i) => (
            <div key={st} className="flex items-center gap-1">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1", i <= stepIdx ? "border-primary/40 bg-primary/10 text-foreground" : "text-muted-foreground")}>{i < stepIdx ? <Check className="size-3 text-primary" /> : i === stepIdx ? <CircleDashed className="size-3 text-primary" /> : null}{st}</span>
              {i < STEPS.length - 1 && <span className="h-px w-5 bg-border" />}
            </div>
          ))}
          {so.status === "cancelled" && <StatusBadge status="cancelled" />}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Section title="Order lines" flush>
              <LinesTable lines={so.lines} />
              <Totals rows={[{ label: "Gross sales", value: t.gross, muted: true }, { label: "Discounts & schemes", value: -t.discount, muted: true }, { label: "Sales tax", value: t.tax, muted: true }, { label: "Further tax", value: t.further, muted: true }, { label: "Advance tax 236H", value: t.wht, muted: true }, { label: "Order total", value: t.total, strong: true }]} />
            </Section>
            {(open || so.status === "draft") && (
              <Section title="Stock availability" description={`At ${whCode(so.warehouseId)}`} flush>
                <table className="w-full text-[13px]"><tbody>{so.lines.filter((l) => !l.free).slice(0, 12).map((l, i) => {
                  const cell = db.stock.get(`${l.productId}|${so.warehouseId}`);
                  const avail = cell ? cell.on - cell.res : 0;
                  const ok = so.status !== "draft" || avail >= l.qty;
                  return <tr key={i} className="border-b last:border-0"><td className="px-4 py-2">{idx().prod.get(l.productId)!.name}</td><td className="px-4 py-2 text-right tabular text-muted-foreground">need {l.qty.toLocaleString("en-US")}</td><td className="px-4 py-2 text-right tabular">{so.status === "draft" ? `${avail.toLocaleString("en-US")} free` : "reserved"}</td><td className="w-8 px-3">{ok ? <Check className="size-4 text-success" /> : <X className="size-4 text-danger" />}</td></tr>;
                })}</tbody></table>
              </Section>
            )}
          </div>
          <div className="space-y-4">
            <Section title="Credit check" actions={cc ? <StatusBadge status={cc.decision} label={cc.decision.toUpperCase()} /> : <StatusBadge status="pass" label="PASSED" />}>
              <div className="space-y-3 text-[13px]">
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>Exposure vs limit</span><span className="tabular">{money(cc?.exposure ?? s.outstanding)} / {money(c.creditLimit)}</span></div>
                  <Progress value={util} className={cn("h-1.5", util >= 100 && "[&>div]:bg-danger")} />
                </div>
                <ul className="space-y-1.5">{(cc?.reasons ?? ["Within limit, no overdue invoices at confirmation"]).map((r) => <li key={r} className="flex gap-2">{cc?.decision === "block" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" /> : <Check className="mt-0.5 size-3.5 shrink-0 text-success" />}<span>{r}</span></li>)}</ul>
              </div>
            </Section>
            <Section title="Order details"><KeyValue cols={1} items={[["Customer", <CustomerLink key="c" id={c.id} />], ["Payment terms", `${c.termsDays} days`], ["Region", `${c.area}, ${c.city}`], ["Source", so.source === "ai_proposal" ? "AI proposal (human confirmed)" : "Entered by rep"], ["Delivery challan", sh ? <Link key="d" href={`/sales/shipments/${sh.id}`} className="font-mono text-xs hover:text-primary">{sh.number} · {sh.vehicle}</Link> : "Not dispatched"], ["Invoice", inv ? <Link key="i" href={`/sales/invoices/${inv.id}`} className="font-mono text-xs hover:text-primary">{inv.number}</Link> : "Not yet invoiced"]]} /></Section>
          </div>
        </div>
      </Page>
    </>
  );
}
