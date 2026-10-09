"use client";
import { Page, PageHeader } from "@/components/app/page-header";
import { DataTable } from "@/components/app/data-table";
import { Mono, StatusBadge } from "@/components/app/status";
import { CustomerLink, whCode } from "@/components/app/entity";
import { getDB, idx } from "@/lib/data/queries";
import type { Shipment } from "@/lib/data/types";
import { dateShort } from "@/lib/format";
import { useWorld } from "@/lib/store";

export default function Shipments() {
  useWorld((s) => s.version);
  const db = getDB();
  return (
    <>
      <PageHeader module="sales" title="Sales" description="Delivery challans and gate passes issued at dispatch. Each ties an order to its invoice." />
      <Page>
        <DataTable<Shipment> rows={db.shipments} rowKey={(s) => s.id} rowHref={(s) => `/sales/shipments/${s.id}`} exportName="shipments" defaultSort={{ id: "d", dir: "desc" }} searchText={(s) => `${s.number} ${idx().cus.get(s.customerId)?.name} ${s.vehicle}`} empty="No shipments yet. Pick and dispatch an order to create one."
          cols={[{ id: "n", header: "Challan", cell: (s) => <Mono>{s.number}</Mono>, sort: (s) => s.number }, { id: "c", header: "Customer", cell: (s) => <CustomerLink id={s.customerId} /> }, { id: "d", header: "Date", cell: (s) => dateShort(s.date), sort: (s) => s.date }, { id: "w", header: "From", cell: (s) => <Mono>{whCode(s.warehouseId)}</Mono> }, { id: "v", header: "Vehicle", cell: (s) => <Mono>{s.vehicle}</Mono>, hide: "md" }, { id: "dr", header: "Driver", cell: (s) => s.driver, hide: "lg" }, { id: "s", header: "Status", cell: (s) => <StatusBadge status={s.status} /> }]} />
      </Page>
    </>
  );
}
