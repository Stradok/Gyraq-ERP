"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { getDB } from "@/lib/data/queries";
import type { OutboxMsg } from "@/lib/data/types";
import { fbrPayload, validateFbr } from "@/lib/integrations/fbr";
import { dateShort } from "@/lib/format";
import { useWorld } from "@/lib/store";
import { cn } from "@/lib/utils";

const CONNECTORS = [
  { name: "FBR Digital Invoicing", desc: "Real-time invoice reporting via PRAL. Every invoice gets an IRN and QR code.", needs: "IRIS integration token for your NTN, then PRAL sandbox scenarios", live: false },
  { name: "Email (SMTP)", desc: "Statements, reminders, quotations and PO emails.", needs: "SMTP host, user and password, or a provider API key", live: false },
  { name: "WhatsApp Business", desc: "Collection follow-ups and order confirmations.", needs: "Meta Business account and approved message templates", live: false },
  { name: "Bank statements (CSV)", desc: "Meezan, HBL and MCB import templates for reconciliation.", needs: "A CSV export from your bank", live: false },
  { name: "Outgoing webhooks", desc: "HMAC-signed events to your own systems.", needs: "An HTTPS endpoint and a shared secret", live: false },
  { name: "ATL verification", desc: "Check whether a buyer is on the Active Taxpayer List.", needs: "FBR ATL access", live: false },
];

export default function Integrations() {
  useWorld((s) => s.version);
  const db = getDB();
  const [sel, setSel] = useState<OutboxMsg | null>(null);
  const [fbrOpen, setFbrOpen] = useState(false);
  const inv = db.invoices[0]!;
  const payload = fbrPayload(db, inv);
  const checks = validateFbr(payload, inv);
  return (
    <>
      <PageHeader title="Integrations" description="Every connector shows whether it is simulated or live. In this demo nothing is sent externally; the outbox shows what would have gone out." />
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full sm:max-w-[480px]">{sel && <><SheetHeader><div className="flex items-center gap-2"><StatusBadge status="simulated" label="Simulated: not sent" /><span className="text-xs text-muted-foreground">{sel.channel}</span></div><SheetTitle>{sel.subject}</SheetTitle><SheetDescription>To {sel.to}</SheetDescription></SheetHeader><pre className="mx-4 whitespace-pre-wrap rounded-md border bg-subtle p-3 font-sans text-[13px] leading-relaxed">{sel.body}</pre></>}</SheetContent>
      </Sheet>
      <Sheet open={fbrOpen} onOpenChange={setFbrOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[640px]"><SheetHeader><SheetTitle>FBR payload for {inv.number}</SheetTitle><SheetDescription>The exact request body the connector will send to PRAL in sandbox or live mode. Shown here without transmitting.</SheetDescription></SheetHeader>
          <div className="space-y-3 px-4 pb-6"><ul className="space-y-1 rounded-md border p-2.5 text-xs">{checks.map((c) => <li key={c.label} className={cn(c.ok ? "text-success" : "text-danger")}>{c.ok ? "✓" : "✗"} {c.label}</li>)}</ul><pre className="max-h-[60dvh] overflow-auto rounded-md border bg-subtle p-3 font-mono text-[11px] leading-relaxed">{JSON.stringify(payload, null, 2)}</pre></div></SheetContent>
      </Sheet>
      <Page>
        <Tabs defaultValue="connectors">
          <TabsList variant="line" className="mb-3"><TabsTrigger value="connectors">Connectors</TabsTrigger><TabsTrigger value="outbox">Outbox ({db.outbox.length})</TabsTrigger></TabsList>
          <TabsContent value="connectors"><div className="grid gap-3 md:grid-cols-2">{CONNECTORS.map((c) => (
            <Section key={c.name} title={c.name} actions={<StatusBadge status="simulated" label="Demo / simulated" />}>
              <p className="text-[13px] text-muted-foreground">{c.desc}</p>
              <p className="mt-2 text-xs"><span className="text-muted-foreground">To go live: </span>{c.needs}.</p>
              <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled title="Live mode is disabled in demo organizations">Connect</Button>{c.name.startsWith("FBR") && <Button size="sm" onClick={() => setFbrOpen(true)}>Preview payload</Button>}</div>
            </Section>))}</div></TabsContent>
          <TabsContent value="outbox"><DataTable<OutboxMsg> rows={db.outbox} rowKey={(m) => m.id} onRowClick={setSel} empty="Nothing queued yet. Send a quotation, dispatch an order or send a follow-up from the assistant." defaultSort={{ id: "at", dir: "desc" }} exportName="outbox"
            cols={[{ id: "at", header: "When", cell: (m) => `${dateShort(m.at.slice(0, 10))} ${m.at.slice(11, 16)}`, sort: (m) => m.at }, { id: "c", header: "Channel", cell: (m) => m.channel }, { id: "to", header: "To", cell: (m) => <span className="truncate">{m.to}</span>, hide: "md" }, { id: "s", header: "Subject", cell: (m) => <span className="line-clamp-1">{m.subject}</span> }, { id: "st", header: "Status", cell: () => <StatusBadge status="simulated" label="Not sent" /> }]} /></TabsContent>
        </Tabs>
      </Page>
    </>
  );
}
void Mono;
