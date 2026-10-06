"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { StatusBadge } from "@/components/app/status";
import { empName } from "@/components/app/entity";
import { getDB } from "@/lib/data/queries";
import type { LeaveRequest } from "@/lib/data/types";
import { dateShort } from "@/lib/format";

export default function Leave() {
  const db = getDB();
  const [dec, setDec] = useState<Record<string, "approved" | "rejected">>({});
  const st = (l: LeaveRequest): string => dec[l.id] ?? l.status;
  return (
    <>
      <PageHeader module="employees" title="Employees" description="Leave requests and balances. Requests route to the line manager." />
      <Page>
        <DataTable<LeaveRequest> rows={db.leaves} rowKey={(l) => l.id} exportName="leave" defaultSort={{ id: "f", dir: "desc" }} searchText={(l) => empName(l.employeeId)}
          filters={[{ id: "s", label: "Status", options: ["pending", "approved", "rejected"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })), test: (l, v) => st(l) === v }]}
          cols={[{ id: "e", header: "Employee", cell: (l) => empName(l.employeeId), sort: (l) => empName(l.employeeId) }, { id: "t", header: "Type", cell: (l) => l.type }, { id: "f", header: "From", cell: (l) => dateShort(l.from), sort: (l) => l.from }, { id: "to", header: "To", cell: (l) => dateShort(l.to), hide: "md" }, { id: "d", header: "Days", cell: (l) => l.days, align: "right" }, { id: "r", header: "Reason", cell: (l) => l.reason, hide: "lg" }, { id: "s", header: "Status", cell: (l) => <StatusBadge status={st(l)} /> }, { id: "a", header: "", cell: (l) => (st(l) === "pending" ? <span className="flex gap-1"><Button size="xs" onClick={() => { setDec({ ...dec, [l.id]: "approved" }); toast.success("Leave approved", { description: empName(l.employeeId) }); }}>Approve</Button><Button size="xs" variant="ghost" onClick={() => setDec({ ...dec, [l.id]: "rejected" })}>Reject</Button></span> : null), align: "right" }]} />
      </Page>
    </>
  );
}
