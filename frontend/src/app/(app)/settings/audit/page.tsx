"use client";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { AiChip } from "@/components/app/ai";
import { Mono } from "@/components/app/status";
import { getDB } from "@/lib/data/queries";
import { useWorld } from "@/lib/store";
import type { AuditEvent } from "@/lib/data/types";
import { dateShort } from "@/lib/format";

export default function Audit() {
  useWorld((s) => s.version);
  const rows = getDB().audit;
  return (
    <>
      <PageHeader module="settings" title="Settings" description="Append-only audit trail of sensitive actions, with source (person, AI proposal, system) and approval references." />
      <Page>
        <DataTable<AuditEvent> rows={rows} rowKey={(e) => e.id} exportName="audit" searchText={(e) => `${e.actor} ${e.action} ${e.ref} ${e.detail ?? ""}`} defaultSort={{ id: "at", dir: "desc" }}
          filters={[{ id: "src", label: "Source", options: [["user", "Person"], ["ai_proposal", "AI proposal"], ["system", "System"], ["workflow", "Workflow"]].map(([v, l]) => ({ value: v!, label: l! })), test: (e, v) => e.source === v }]}
          cols={[{ id: "at", header: "When", cell: (e) => `${dateShort(e.at.slice(0, 10))} ${e.at.slice(11, 16)}`, sort: (e) => e.at }, { id: "a", header: "Actor", cell: (e) => e.actor, sort: (e) => e.actor }, { id: "ac", header: "Action", cell: (e) => <Mono>{e.action}</Mono> }, { id: "r", header: "Record", cell: (e) => <span>{e.entity} <Mono className="text-muted-foreground">{e.ref}</Mono></span>, hide: "md" }, { id: "d", header: "Detail", cell: (e) => <span className="text-muted-foreground">{e.detail}</span>, hide: "lg" }, { id: "s", header: "Source", cell: (e) => (e.source === "ai_proposal" ? <AiChip label="AI proposal" /> : <span className="text-xs text-muted-foreground">{e.source}</span>) }]} />
      </Page>
    </>
  );
}
