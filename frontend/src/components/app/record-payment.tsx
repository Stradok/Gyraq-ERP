"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { recordPayment } from "@/lib/actions";
import { getDB, idx } from "@/lib/data/queries";
import { money } from "@/lib/format";
import type { CustomerPayment } from "@/lib/data/types";

export function RecordPaymentDialog({ customerId, defaultAmount, trigger, open: ext, onOpenChange }: { customerId?: string; defaultAmount?: number; trigger?: React.ReactNode; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [int, setInt] = useState(false);
  const open = ext ?? int, setOpen = onOpenChange ?? setInt;
  const [cid, setCid] = useState(customerId ?? "");
  const [amount, setAmount] = useState(defaultAmount ? String(Math.round(defaultAmount)) : "");
  const [method, setMethod] = useState<CustomerPayment["method"]>("bank_transfer");
  const [ref, setRef] = useState("");
  const db = getDB();
  const owing = db.customers.filter((c) => db.invoices.some((i) => i.customerId === c.id && i.total - i.paid > 0.5));
  const outstanding = cid ? db.invoices.filter((i) => i.customerId === cid).reduce((s, i) => s + i.total - i.paid, 0) : 0;
  const valid = cid && +amount > 0 && +amount <= outstanding + 0.5;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Record payment</DialogTitle><DialogDescription>Allocated to the customer&apos;s oldest open invoices first. Posts Dr Bank / Cr Trade Debtors.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Customer</Label>
            <Select value={cid} onValueChange={setCid}><SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger><SelectContent>{owing.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
            {cid && <p className="text-xs text-muted-foreground">Outstanding {money(outstanding)} · {idx().cus.get(cid)!.city}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Amount (PKR)</Label><Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} className="tabular" /></div>
            <div className="space-y-1.5"><Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as CustomerPayment["method"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[["bank_transfer", "Bank transfer"], ["cash", "Cash"], ["cheque", "Cheque"], ["pdc", "Post-dated cheque"]].map(([v, l]) => <SelectItem key={v} value={v!}>{l}</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          {(method === "cheque" || method === "pdc") && <div className="space-y-1.5"><Label>Cheque number</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. 448291" /></div>}
          {amount && +amount > outstanding + 0.5 && <p className="text-xs text-danger">Amount is more than the customer owes ({money(outstanding)}).</p>}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!valid} onClick={() => { recordPayment({ customerId: cid, amount: +amount, method, ref }); setOpen(false); }}>Record payment</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
