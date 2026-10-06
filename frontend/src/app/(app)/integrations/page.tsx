"use client";
import { Page, PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status";

const INTEGRATIONS = [
  ["FBR Digital Invoicing", "Real-time invoice reporting via PRAL. IRN and QR on every invoice.", "simulated"],
  ["Email (SMTP)", "Statements, reminders and PO emails.", "simulated"],
  ["WhatsApp Business", "Collection follow-ups and order confirmations.", "simulated"],
  ["Bank statements (CSV)", "Meezan, HBL, MCB import templates for reconciliation.", "simulated"],
  ["Outgoing webhooks", "HMAC-signed events to your own systems.", "simulated"],
  ["ATL verification", "Active Taxpayer List check for buyers.", "simulated"],
  ["Shopify / WooCommerce", "Order sync from online stores.", "available"],
  ["Slack / Google Workspace", "Approvals and notifications in chat.", "available"],
] as const;
export default function Integrations() {
  return (
    <>
      <PageHeader title="Integrations" description="Every connector shows whether it is simulated or live. Nothing is ever sent externally from the demo." />
      <Page>
        <div className="grid gap-3 md:grid-cols-2">{INTEGRATIONS.map(([n, d, s]) => (
          <div key={n} className="rounded-lg border bg-card p-4"><div className="flex items-center justify-between"><span className="text-[13.5px] font-medium">{n}</span>{s === "simulated" ? <StatusBadge status="simulated" label="Demo / simulated" /> : <StatusBadge status="draft" label="Not connected" />}</div><p className="mt-1 text-xs text-muted-foreground">{d}</p></div>))}</div>
      </Page>
    </>
  );
}
