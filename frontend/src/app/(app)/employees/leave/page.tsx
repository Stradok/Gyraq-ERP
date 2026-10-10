"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { run } from "@/lib/engine/client";
import { LeaveDialog } from "@/components/app/forms";
import { PERSONAS, can } from "@/lib/rbac";
import { useERP } from "@/lib/store";
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
  const role = useERP((s) => s.role);
  const [open, setOpen] = useState(false);
  const me = db.employees.find((e) => e.name === PERSONAS.find((p) => p.role === role)!.empName);
  const rows = role === "employee" && me ? db.leaves.filter((l) => l.employeeId === me.id) : db.leaves;
  const st = (l: LeaveRequest): string => l.status;
  const decide = (l: LeaveRequest, decision: "approved" | "rejected") => { const a = db.approvals.find((x) => x.type === "leave" && x.ref === l.id && x.status === "pending"); if (a) run("DecideApproval", { id: a.id, decision }); };
  const canDecide = role !== "employee" && role !== "rep";
  return (
    <>
      <PageHeader module="employees" title="Employees" description="Leave requests and balances. Requests route to the line manager." actions={me && <Button size="sm" onClick={() => setOpen(true)}><Plus />Request leave</Button>} />
      {me && <LeaveDialog open={open} onOpenChange={setOpen} employeeId={me.id} />}
      <Page>
        <DataTable<LeaveRequest> rows={rows} rowKey={(l) => l.id} exportName="leave" defaultSort={{ id: "f", dir: "desc" }} searchText={(l) => empName(l.employeeId)}
          filters={[{ id: "s", label: "Status", options: ["pending", "approved", "rejected"].map((s) => ({ value: s, label: s[0]!.toUpperCase() + s.slice(1) })), test: (l, v) => st(l) === v }]}
          cols={[{ id: "e", header: "Employee", cell: (l) => empName(l.employeeId), sort: (l) => empName(l.employeeId) }, { id: "t", header: "Type", cell: (l) => l.type }, { id: "f", header: "From", cell: (l) => dateShort(l.from), sort: (l) => l.from }, { id: "to", header: "To", cell: (l) => dateShort(l.to), hide: "md" }, { id: "d", header: "Days", cell: (l) => l.days, align: "right" }, { id: "r", header: "Reason", cell: (l) => l.reason, hide: "lg" }, { id: "s", header: "Status", cell: (l) => <StatusBadge status={st(l)} /> }, { id: "a", header: "", cell: (l) => (st(l) === "pending" && canDecide ? <span className="flex gap-1"><Button size="xs" onClick={() => decide(l, "approved")}>Approve</Button><Button size="xs" variant="ghost" onClick={() => decide(l, "rejected")}>Reject</Button></span> : null), align: "right" }]} />
      </Page>
    </>
  );
}
