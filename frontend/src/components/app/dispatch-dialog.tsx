"use client";
import { useState } from "react";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { run } from "@/lib/engine/client";

export function DispatchDialog({ orderId, open, onOpenChange, onDone }: { orderId: string; open: boolean; onOpenChange: (o: boolean) => void; onDone?: (r: { invoiceId: string; shipmentId: string }) => void }) {
  const [vehicle, setVehicle] = useState(""), [driver, setDriver] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Dispatch order</DialogTitle><DialogDescription>Issues the delivery challan and gate pass, takes stock out at cost and raises the invoice with its FBR reference (simulated).</DialogDescription></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><label htmlFor="veh" className="text-xs text-muted-foreground">Vehicle number</label><Input id="veh" value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="KHI-4821" /></div>
          <div className="space-y-1.5"><label htmlFor="drv" className="text-xs text-muted-foreground">Driver</label><Input id="drv" value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Sajid Ali" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => { const r = run("DispatchOrder", { orderId, vehicle, driver }); if (r.ok) { onOpenChange(false); onDone?.(r.value as { invoiceId: string; shipmentId: string }); } }}><Truck />Dispatch and invoice</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
