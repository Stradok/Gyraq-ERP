"use client";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { Switch } from "@/components/ui/switch";
import { useERP } from "@/lib/store";

const NOTIFICATION_TYPES = [
  ["approvals", "Approval requested", "When something needs your decision"],
  ["stock", "Low stock and replenishment", "Products that will run out before delivery"],
  ["payments", "Payments and cheques", "Bounced cheques and overdue accounts"],
  ["purchasing", "Purchasing", "Bill exceptions and delivery updates"],
  ["finance", "Finance", "Cash-flow warnings and period close"],
  ["ai", "AI detections", "Anomalies and insights"],
] as const;

export default function NotificationPrefs() {
  const muted = useERP((s) => s.mutedTypes);
  const toggle = useERP((s) => s.toggleMuted);
  return (
    <>
      <PageHeader module="settings" title="Settings" description="Choose which notifications reach your bell. Everything stays in the audit log either way." />
      <Page>
        <Section flush><ul className="divide-y">{NOTIFICATION_TYPES.map(([k, l, d]) => <li key={k} className="flex items-center justify-between gap-4 px-4 py-3"><div><div className="text-[13.5px] font-medium">{l}</div><div className="text-xs text-muted-foreground">{d}</div></div><Switch checked={!muted.includes(k)} onCheckedChange={() => toggle(k)} aria-label={l} /></li>)}</ul></Section>
      </Page>
    </>
  );
}
