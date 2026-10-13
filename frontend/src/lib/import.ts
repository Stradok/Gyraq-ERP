// Spreadsheet import for onboarding: each row becomes one ordinary command, so every rule, permission and audit entry applies.
import type { DB } from "./data/sim";
import type { CommandInput, CommandType } from "./engine/commands";
import { parseCsv } from "./csv";

export type Kind = "customers" | "suppliers" | "products" | "opening_receivables" | "opening_payables";
export interface Planned { row: number; type: CommandType; payload: unknown }
export interface Bad { row: number; error: string }

export const TEMPLATES: Record<Kind, { title: string; columns: string; example: string }> = {
  customers: { title: "Customers", columns: "name,city,province,area,channel,credit_limit,terms_days,contact,phone,email,registered,ntn", example: "Corner Mart,Karachi,Sindh,Saddar,retail,500000,15,Ali,0300-1111111,ali@example.com,no," },
  suppliers: { title: "Suppliers", columns: "name,city,province,ntn,lead_time_days,terms_days,contact,phone,email,kind", example: "Unilever Pakistan,Karachi,Sindh,1234567-1,5,30,Sana,0300-2222222,sana@example.com,goods" },
  products: { title: "Products", columns: "name,brand,category,supplier,carton_size,price,cost,mrp,tax_category,hs_code,shelf_life_days", example: "Test Soap 100g,Test,personal_care,Unilever Pakistan,24,100,80,120,standard,3401.1100,365" },
  opening_receivables: { title: "Opening receivables (what customers owe)", columns: "customer,invoice,date,amount", example: "Corner Mart,10442,2026-08-30,25000" },
  opening_payables: { title: "Opening payables (what you owe suppliers)", columns: "supplier,invoice,date,amount", example: "Unilever Pakistan,LF-23817,2026-09-02,80000" },
};

const key = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const num = (v: string | undefined) => Number((v ?? "").replace(/[, ]/g, ""));
const yes = (v: string | undefined) => /^(y|yes|true|1)$/i.test((v ?? "").trim());

export function plan(kind: Kind, text: string, db: DB): { good: Planned[]; bad: Bad[] } {
  const [head, ...body] = parseCsv(text);
  const good: Planned[] = [], bad: Bad[] = [];
  if (!head) return { good, bad: [{ row: 1, error: "The file is empty." }] };
  const cols = head.map(key);
  const find = <T extends { id: string; name: string }>(list: T[], name: string) => list.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  body.forEach((cells, i) => {
    const r = Object.fromEntries(cols.map((c, k) => [c, (cells[k] ?? "").trim()])) as Record<string, string>;
    const row = i + 2, fail = (error: string) => void bad.push({ row, error });
    const add = <T extends CommandType>(type: T, payload: CommandInput<T>) => void good.push({ row, type, payload });
    if (kind === "customers") {
      if (!r.name) return fail("name is required");
      const registered = yes(r.registered);
      add("CreateCustomer", { name: r.name, channel: (r.channel || "retail") as never, city: r.city || "Karachi", province: r.province || "Sindh", area: r.area || r.city || "", registered, ntn: registered ? r.ntn : undefined, atl: registered, creditLimit: num(r.credit_limit), termsDays: num(r.terms_days) || 7, contact: r.contact || "", phone: r.phone || "", email: r.email || "", repId: "" });
    } else if (kind === "suppliers") {
      if (!r.name) return fail("name is required");
      add("CreateSupplier", { name: r.name, city: r.city || "Karachi", province: r.province || "Sindh", ntn: r.ntn || "", isPrincipal: true, leadTimeDays: num(r.lead_time_days) || 7, termsDays: num(r.terms_days) || 30, contact: r.contact || "", phone: r.phone || "", email: r.email || "", kind: r.kind === "services" ? "services" : "goods" });
    } else if (kind === "products") {
      const s = find(db.suppliers, r.supplier ?? ""); if (!s) return fail(`supplier "${r.supplier}" is not in the system; import suppliers first`);
      if (!r.name) return fail("name is required");
      add("CreateProduct", { name: r.name, brand: r.brand || "", category: (r.category || "packaged_foods") as never, supplierId: s.id, cartonSize: num(r.carton_size) || 1, price: num(r.price), cost: num(r.cost), mrp: num(r.mrp), taxCategory: (r.tax_category || "standard") as never, hsCode: r.hs_code || "", shelfLifeDays: num(r.shelf_life_days) || 365 });
    } else if (kind === "opening_receivables") {
      const c = find(db.customers, r.customer ?? ""); if (!c) return fail(`customer "${r.customer}" is not in the system; import customers first`);
      add("PostOpeningReceivable", { customerId: c.id, reference: r.invoice ?? "", date: r.date ?? "", amount: num(r.amount) });
    } else {
      const s = find(db.suppliers, r.supplier ?? ""); if (!s) return fail(`supplier "${r.supplier}" is not in the system; import suppliers first`);
      add("PostOpeningPayable", { supplierId: s.id, reference: r.invoice ?? "", date: r.date ?? "", amount: num(r.amount) });
    }
  });
  return { good, bad };
}
