import { BarChart3, Boxes, Building2, Factory, Landmark, LayoutDashboard, MessagesSquare, Plug, Receipt, Settings, ShoppingCart, Truck, UserSquare, Users, Warehouse, Workflow, type LucideIcon } from "lucide-react";
import type { Module } from "./rbac";

export interface NavItem { module: Module; label: string; href: string; icon: LucideIcon; section: string }
export const NAV: NavItem[] = [
  { module: "overview", label: "Overview", href: "/overview", icon: LayoutDashboard, section: "" },
  { module: "sales", label: "Sales", href: "/sales/orders", icon: ShoppingCart, section: "Operations" },
  { module: "customers", label: "Customers", href: "/customers", icon: Users, section: "Operations" },
  { module: "inventory", label: "Inventory", href: "/inventory", icon: Boxes, section: "Operations" },
  { module: "warehouses", label: "Warehouses", href: "/warehouses", icon: Warehouse, section: "Operations" },
  { module: "purchasing", label: "Purchasing", href: "/purchasing/orders", icon: Truck, section: "Operations" },
  { module: "suppliers", label: "Suppliers", href: "/suppliers", icon: Factory, section: "Operations" },
  { module: "finance", label: "Finance", href: "/finance/statements", icon: Landmark, section: "Finance" },
  { module: "expenses", label: "Expenses", href: "/expenses", icon: Receipt, section: "Finance" },
  { module: "employees", label: "Employees", href: "/employees", icon: UserSquare, section: "People" },
  { module: "reports", label: "Reports", href: "/reports", icon: BarChart3, section: "Insights" },
  { module: "ai", label: "AI Command Center", href: "/ai", icon: MessagesSquare, section: "Insights" },
  { module: "automations", label: "Automations", href: "/automations", icon: Workflow, section: "System" },
  { module: "integrations", label: "Integrations", href: "/integrations", icon: Plug, section: "System" },
  { module: "settings", label: "Settings", href: "/settings", icon: Settings, section: "System" },
];

export const TABS: Partial<Record<Module, { label: string; href: string }[]>> = {
  sales: [
    { label: "Orders", href: "/sales/orders" }, { label: "Quotations", href: "/sales/quotes" }, { label: "Invoices", href: "/sales/invoices" }, { label: "Challans", href: "/sales/shipments" },
    { label: "Payments", href: "/sales/payments" }, { label: "Returns", href: "/sales/returns" }, { label: "Leads", href: "/sales/leads" },
  ],
  inventory: [
    { label: "Products", href: "/inventory" }, { label: "Replenishment", href: "/inventory/replenishment" }, { label: "Stock position", href: "/inventory/stock" }, { label: "Expiry", href: "/inventory/expiry" },
  ],
  purchasing: [
    { label: "Purchase orders", href: "/purchasing/orders" }, { label: "Goods receipts", href: "/purchasing/receipts" }, { label: "Supplier bills", href: "/purchasing/bills" }, { label: "Payments", href: "/purchasing/payments" }, { label: "Claims", href: "/purchasing/claims" },
  ],
  finance: [
    { label: "Statements", href: "/finance/statements" }, { label: "Cash-flow forecast", href: "/finance/cashflow" }, { label: "Receivables", href: "/finance/receivables" }, { label: "Payables", href: "/finance/payables" },
    { label: "Journal & ledger", href: "/finance/journal" }, { label: "Bank reconciliation", href: "/finance/reconciliation" }, { label: "Tax & FBR", href: "/finance/tax" },
  ],
  employees: [{ label: "Directory", href: "/employees" }, { label: "Leave", href: "/employees/leave" }, { label: "Payroll", href: "/employees/payroll" }],
  settings: [{ label: "Organization", href: "/settings" }, { label: "Users & roles", href: "/settings/roles" }, { label: "Audit log", href: "/settings/audit" }, { label: "AI", href: "/settings/ai" }, { label: "System health", href: "/settings/health" }],
};

export function titleFor(path: string): string {
  for (const t of Object.values(TABS)) for (const x of t ?? []) if (x.href === path) return x.label;
  const n = NAV.find((x) => path === x.href || path.startsWith(x.href + "/") || (x.href !== "/" && path.startsWith("/" + x.href.split("/")[1])));
  return n?.label ?? "Meridian";
}

export const Icons = { Building2 };
