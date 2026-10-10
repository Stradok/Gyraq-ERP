// Demo personas and UI-level permissions. UI hiding is UX only; the real boundary will be server-side (docs/plan/07).
export type Role = "owner" | "admin" | "finance" | "sales_manager" | "rep" | "warehouse" | "procurement" | "employee";

export interface Persona { role: Role; name: string; title: string; email: string; empName: string }
export const PERSONAS: Persona[] = [
  { role: "owner", name: "Tariq Mehmood", title: "Owner / CEO", email: "owner@meridian.demo", empName: "Tariq Mehmood" },
  { role: "finance", name: "Ayesha Siddiqui", title: "Finance Manager", email: "finance@meridian.demo", empName: "Ayesha Siddiqui" },
  { role: "sales_manager", name: "Bilal Ahmed", title: "Head of Sales", email: "sales.manager@meridian.demo", empName: "Bilal Ahmed" },
  { role: "rep", name: "Usman Ghani", title: "Order Booker – Karachi South", email: "rep.karachi@meridian.demo", empName: "Usman Ghani" },
  { role: "warehouse", name: "Imran Qureshi", title: "Warehouse Manager", email: "warehouse.khi@meridian.demo", empName: "Imran Qureshi" },
  { role: "procurement", name: "Hina Rauf", title: "Procurement Manager", email: "procurement@meridian.demo", empName: "Hina Rauf" },
  { role: "admin", name: "Zainab Hussain", title: "IT & Admin", email: "admin@meridian.demo", empName: "Zainab Hussain" },
  { role: "employee", name: "Kashif Raza", title: "Accounts Officer", email: "employee@meridian.demo", empName: "Kashif Raza" },
];

export type Module =
  | "overview" | "sales" | "customers" | "inventory" | "warehouses" | "purchasing" | "suppliers" | "finance"
  | "expenses" | "employees" | "reports" | "ai" | "automations" | "integrations" | "settings" | "approvals";

const ALL: Module[] = ["overview", "sales", "customers", "inventory", "warehouses", "purchasing", "suppliers", "finance", "expenses", "employees", "reports", "ai", "automations", "integrations", "settings", "approvals"];
export const ROLE_MODULES: Record<Role, Module[]> = {
  owner: ALL,
  admin: ALL,
  finance: ["overview", "sales", "customers", "finance", "purchasing", "suppliers", "expenses", "employees", "reports", "ai", "approvals", "settings"],
  sales_manager: ["overview", "sales", "customers", "inventory", "reports", "ai", "approvals", "expenses"],
  rep: ["overview", "sales", "customers", "inventory", "ai", "expenses"],
  warehouse: ["overview", "inventory", "warehouses", "purchasing", "approvals", "expenses"],
  procurement: ["overview", "inventory", "purchasing", "suppliers", "reports", "ai", "approvals", "expenses"],
  employee: ["expenses", "employees", "approvals"],
};
export const canSee = (r: Role, m: Module) => ROLE_MODULES[r].includes(m);

export type Action = "warehouse.ops" | "po.receive" | "master.create" | "stock.adjust" | "bill.create" | "supplier.pay" | "return.create" | "approve.po" | "approve.finance" | "approve.credit" | "approve.expense" | "ai.confirm" | "po.create" | "payment.record" | "order.create" | "period.close" | "hr.manage";
const ACTIONS: Record<Action, Role[]> = {
  "warehouse.ops": ["owner", "admin", "warehouse", "sales_manager"],
  "po.receive": ["owner", "admin", "warehouse", "procurement"],
  "master.create": ["owner", "admin", "sales_manager", "procurement", "finance"],
  "stock.adjust": ["owner", "admin", "warehouse", "finance"],
  "bill.create": ["owner", "admin", "finance", "procurement"],
  "supplier.pay": ["owner", "admin", "finance"],
  "return.create": ["owner", "admin", "sales_manager", "finance", "warehouse"],
  "approve.po": ["owner", "admin", "procurement"],
  "approve.finance": ["owner", "admin", "finance"],
  "approve.credit": ["owner", "admin", "sales_manager", "finance"],
  "approve.expense": ["owner", "admin", "finance", "sales_manager", "warehouse", "procurement"],
  "ai.confirm": ["owner", "admin", "finance", "sales_manager", "procurement", "warehouse"],
  "po.create": ["owner", "admin", "procurement"],
  "payment.record": ["owner", "admin", "finance", "sales_manager", "rep"],
  "order.create": ["owner", "admin", "sales_manager", "rep"],
  "period.close": ["owner", "finance"],
  "hr.manage": ["owner", "admin", "finance"],
};
export const can = (r: Role, a: Action) => ACTIONS[a].includes(r);
