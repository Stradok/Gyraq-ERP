"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, Check, CircleDashed, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { StatusBadge, Mono } from "@/components/app/status";
import { CustomerLink, KeyValue, LinesTable, Totals, empName, whCode } from "@/components/app/entity";
import { customerStats, getDB, idx } from "@/lib/data/queries";
import { docTotals } from "@/lib/engines";
import { dateLong, money } from "@/lib/format";
import { useOverlay } from "@/lib/overlay";
import { useERP } from "@/lib/store";
import { PERSONAS, can } from "@/lib/rbac";
import { cn } from "@/lib/utils";

const STEPS = ["Draft", "Confirmed", "Reserved", "Fulfilled"] as const;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { orders } = useOverlay();
  const { role, extraApprovals, addAudit } = useERP();
  const so = orders.find((o) => o.id === id);
  if (!so) return <Page><p className="text-sm text-muted-foreground">Order not found.</p></Page>;
  const c = idx().cus.get(so.customerId)!;
  const s = customerStats(c.id);
  const t = docTotals(so.lines, c);
  const inv = so.invoiceId ? idx().inv.get(so.invoiceId) : null;
  const cc = so.creditCheck;
  const stepIdx = so.status === "draft" ? 0 : so.status === "confirmed" ? 1 : so.status === "reserved" || so.status === "partially_fulfilled" ? 2 : so.status === "fulfilled" ? 3 : -1;
  const open = so.status === "confirmed" || so.status === "reserved" || so.status === "draft";
  const db = getDB();
  const hasOverride = [...extraApprovals, ...db.approvals].some((a) => a.type === "credit_override" && (a.ref === so.id));
  const util = cc ? Math.min(100, (cc.exposure / cc.limit) * 100) : Math.min(100, (s.outstanding / c.creditLimit) * 100);
  return (
    <>
      <PageHeader back={{ href: "/sales/orders", label: "Orders" }} title={<span className="flex items-center gap-3"><Mono className="text-xl">{so.number}</Mono><StatusBadge status={so.status} />{so.source === "ai_proposal" && <span className="text-xs text-ai">AI-proposed</span>}</span>}
        description={<span><CustomerLink id={c.id} /> · {dateLong(so.date)} · booked by {empName(so.repId)} · ships from {whCode(so.warehouseId)}</span>}
        actions={inv ? <Button size="sm" asChild><Link href={`/sales/invoices/${inv.id}`}>View invoice {inv.number}</Link></Button> : cc?.decision === "block" && so.status === "draft" && !hasOverride && can(role, "order.create") ? (
          <Button size="sm" onClick={() => {
            const a = { id: `apr_new_co_${so.id}`, type: "credit_override" as const, title: `Credit override – ${c.name}`, subtitle: `${so.number} exceeds limit; ${cc.reasons[0]}`, amount: so.total, requestedBy: PERSONAS.find((p) => p.role === role)!.name, requestedAt: db.today, status: "pending" as const, ref: so.id, source: "user" as const, step: "Sales Manager" };
            useERP.setState((st) => ({ extraApprovals: [a, ...st.extraApprovals] }));
            addAudit({ id: `au_new_${Date.now()}`, at: new Date().toISOString(), actor: PERSONAS.find((p) => p.role === role)!.name, action: "customer.credit_override_requested", entity: "Sales order", ref: so.number, source: "user", detail: cc.reasons.join("; ") });
            toast.success("Override requested", { description: "Sent to the Sales Manager's approval inbox." });
          }}>Request credit override</Button>
        ) : cc?.decision === "block" && hasOverride ? <StatusBadge status="pending" label="Override pending" /> : null} />
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
            {open && (
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
            <Section title="Order details"><KeyValue cols={1} items={[["Customer", <CustomerLink key="c" id={c.id} />], ["Payment terms", `${c.termsDays} days`], ["Region", `${c.area}, ${c.city}`], ["Source", so.source === "ai_proposal" ? "AI proposal (human confirmed)" : "Entered by rep"], ["Invoice", inv ? <Link key="i" href={`/sales/invoices/${inv.id}`} className="font-mono text-xs hover:text-primary">{inv.number}</Link> : "Not yet invoiced"]]} /></Section>
          </div>
        </div>
      </Page>
    </>
  );
}
