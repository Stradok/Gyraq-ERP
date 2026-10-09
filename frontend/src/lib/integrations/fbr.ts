// FBR Digital Invoicing payload mapper (PRAL API shape) and pre-flight validation.
// In demo mode nothing is transmitted; the same mapper feeds the sandbox/live connector later.
import { ORG } from "../data/catalog";
import type { DB } from "../data/sim";
import type { Invoice } from "../data/types";

export interface FbrItem {
  hsCode: string; productDescription: string; quantity: number; uoM: string; saleType: string; rate: string;
  totalValues: number; valueSalesExcludingST: number; salesTaxApplicable: number; salesTaxWithheldAtSource: number;
  extraTax: number; furtherTax: number; fedPayable: number; discount: number; fixedNotifiedValueOrRetailPrice: number;
  sroScheduleNo: string; sroItemSerialNo: string;
}
export interface FbrPayload {
  invoiceType: "Sale Invoice"; invoiceDate: string; invoiceRefNo: string;
  sellerNTNCNIC: string; sellerBusinessName: string; sellerProvince: string; sellerAddress: string;
  buyerNTNCNIC: string; buyerBusinessName: string; buyerProvince: string; buyerAddress: string; buyerRegistrationType: "Registered" | "Unregistered";
  items: FbrItem[];
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function fbrPayload(db: DB, inv: Invoice): FbrPayload {
  const c = db.customers.find((x) => x.id === inv.customerId)!;
  const paid = inv.lines.filter((l) => !l.free);
  const items: FbrItem[] = paid.map((l) => {
    const p = db.products.find((x) => x.id === l.productId)!;
    const third = p.taxCategory === "third_schedule", exempt = p.taxCategory === "exempt";
    const share = inv.subtotal - inv.discount ? l.value / (inv.subtotal - inv.discount) : 0;
    return {
      hsCode: p.hsCode, productDescription: p.name, quantity: l.qty, uoM: "Numbers, pieces, units",
      saleType: exempt ? "Exempt goods" : third ? "3rd Schedule Goods" : "Goods at Standard Rate (default)", rate: exempt ? "Exempt" : "18%",
      totalValues: r2(l.value + l.salesTax + inv.furtherTax * share), valueSalesExcludingST: r2(l.value), salesTaxApplicable: r2(l.salesTax), salesTaxWithheldAtSource: 0,
      extraTax: 0, furtherTax: r2(inv.furtherTax * share), fedPayable: 0, discount: r2(l.discount), fixedNotifiedValueOrRetailPrice: third ? r2(p.mrp * l.qty) : 0,
      sroScheduleNo: exempt ? "6th Schd" : "", sroItemSerialNo: exempt ? "1" : "",
    };
  });
  return {
    invoiceType: "Sale Invoice", invoiceDate: inv.date, invoiceRefNo: inv.number,
    sellerNTNCNIC: ORG.ntn, sellerBusinessName: ORG.legalName, sellerProvince: "Sindh", sellerAddress: ORG.address,
    buyerNTNCNIC: c.ntn ?? c.cnic ?? "", buyerBusinessName: c.name, buyerProvince: c.province === "ICT" ? "Capital Territory" : c.province, buyerAddress: `${c.area}, ${c.city}`, buyerRegistrationType: c.registered ? "Registered" : "Unregistered",
    items,
  };
}

export interface FbrCheck { ok: boolean; label: string }
export function validateFbr(p: FbrPayload, inv: Invoice): FbrCheck[] {
  const sumTax = r2(p.items.reduce((s, i) => s + i.salesTaxApplicable, 0));
  const sumVal = r2(p.items.reduce((s, i) => s + i.valueSalesExcludingST, 0));
  return [
    { ok: /^\d{7}-\d$/.test(p.sellerNTNCNIC), label: "Seller NTN format" },
    { ok: !!p.buyerNTNCNIC, label: "Buyer NTN or CNIC present" },
    { ok: p.items.length > 0 && p.items.every((i) => /^\d{4}\.\d{4}$/.test(i.hsCode)), label: "Every line has a valid HS code" },
    { ok: Math.abs(sumVal - r2(inv.subtotal - inv.discount)) < 1, label: `Line values reconcile to the invoice (${sumVal} vs ${r2(inv.subtotal - inv.discount)})` },
    { ok: Math.abs(sumTax - inv.salesTax) < 1, label: `Line sales tax reconciles to the invoice (${sumTax} vs ${inv.salesTax})` },
    { ok: p.buyerRegistrationType === "Registered" || p.items.every((i) => i.furtherTax > 0) || inv.furtherTax === 0, label: "Further tax shown for unregistered buyers" },
    { ok: p.items.every((i) => i.saleType !== "3rd Schedule Goods" || i.fixedNotifiedValueOrRetailPrice > 0), label: "Third Schedule lines carry the retail price" },
  ];
}
