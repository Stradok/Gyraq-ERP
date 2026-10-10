"use client";
import { Suspense, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmployeeDialog } from "@/components/app/forms";
import { can } from "@/lib/rbac";
import { useSearchParams } from "next/navigation";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { MoneyText, KeyValue, empName } from "@/components/app/entity";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getDB } from "@/lib/data/queries";
import type { Employee } from "@/lib/data/types";
import { dateShort } from "@/lib/format";
import { useERP } from "@/lib/store";

function Directory() {
  const sp = useSearchParams();
  const db = getDB();
  const role = useERP((s) => s.role);
  const [sel, setSel] = useState<Employee | null>(null);
  const [openNew, setOpenNew] = useState(false);
  const [edit, setEdit] = useState<Employee | null>(null);
  const hr = can(role, "hr.manage");
  const seeSalary = role === "owner" || role === "admin" || role === "finance";
  const rows = role === "employee" ? db.employees.filter((e) => e.name === "Kashif Raza") : db.employees;
  const depts = [...new Set(db.employees.map((e) => e.department))];
  return (
    <>
      <PageHeader module="employees" title="Employees" description={role === "employee" ? "Your record" : `${db.employees.length} people across ${depts.length} departments. Salary is visible only to Finance and management.`} actions={hr && <Button size="sm" onClick={() => setOpenNew(true)}><Plus />New employee</Button>} />
      <EmployeeDialog open={openNew} onOpenChange={setOpenNew} onCreated={() => undefined} />
      {edit && <EmployeeDialog key={edit.id} open onOpenChange={(o) => !o && setEdit(null)} employee={edit} />}
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full sm:max-w-[440px]">{sel && <><SheetHeader><SheetTitle>{sel.name}</SheetTitle><SheetDescription>{sel.position} · {sel.department}</SheetDescription></SheetHeader><div className="px-4"><KeyValue items={[["Employee ID", sel.code], ["Manager", sel.managerId ? empName(sel.managerId) : "—"], ["Branch", sel.branch], ["Joined", dateShort(sel.joinDate) + " " + sel.joinDate.slice(0, 4)], ["Status", sel.status.replace("_", " ")], ["Phone", sel.phone], ["Email", sel.email], ["CNIC", seeSalary ? sel.cnic : "•••••-•••••••-•"], ["Salary (monthly)", seeSalary ? `Rs ${sel.salary.toLocaleString("en-US")}` : "Restricted"]]} /></div>{hr && <div className="px-4 pt-4"><Button variant="outline" size="sm" onClick={() => { setEdit(sel); setSel(null); }}><Pencil />Edit</Button></div>}</>}</SheetContent>
      </Sheet>
      <Page>
        <DataTable<Employee> rows={rows} rowKey={(e) => e.id} onRowClick={setSel} exportName="employees" initialSearch={sp.get("q") ?? ""} searchText={(e) => `${e.name} ${e.code} ${e.position} ${e.department}`} defaultSort={{ id: "n", dir: "asc" }}
          filters={[{ id: "d", label: "Department", options: depts.map((d) => ({ value: d, label: d })), test: (e, v) => e.department === v }, { id: "b", label: "Branch", options: [...new Set(db.employees.map((e) => e.branch))].map((d) => ({ value: d, label: d })), test: (e, v) => e.branch === v }]}
          cols={[{ id: "c", header: "ID", cell: (e) => <Mono>{e.code}</Mono>, sort: (e) => e.code, hide: "md" }, { id: "n", header: "Name", cell: (e) => <span className="font-medium">{e.name}</span>, sort: (e) => e.name }, { id: "p", header: "Position", cell: (e) => e.position, sort: (e) => e.position }, { id: "d", header: "Department", cell: (e) => e.department, hide: "lg", sort: (e) => e.department }, { id: "m", header: "Manager", cell: (e) => (e.managerId ? empName(e.managerId) : "—"), hide: "xl" }, { id: "j", header: "Joined", cell: (e) => dateShort(e.joinDate), hide: "lg", sort: (e) => e.joinDate }, { id: "s", header: "Salary", cell: (e) => (seeSalary ? <MoneyText v={e.salary} /> : <span className="text-muted-foreground">••••••</span>), align: "right", hide: "md", sort: (e) => (seeSalary ? e.salary : 0) }, { id: "st", header: "Status", cell: (e) => <StatusBadge status={e.status} /> }]} />
      </Page>
    </>
  );
}
export default function Route() { return <Suspense><Directory /></Suspense>; }
void Section;
