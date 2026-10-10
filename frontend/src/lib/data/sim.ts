// Deterministic business simulation (docs/plan/09-seed-and-demo.md §3).
// 15 months of history ending today. Fixed PRNG seed => same business every run, dates shift with the calendar.
// Stock, AR, AP and the GL are produced by the same events, so they reconcile by construction.
import {
  BANKS, CATEGORIES, CUSTOMERS, FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, ORG, PRODUCTS, SCHEMES, SUPPLIERS, WAREHOUSES,
} from "./catalog";
import { addDays, addMonths, diffDays, endOfMonth, monthKey, startOfMonth, todayPK, weekday } from "./dates";
import type {
  Account, Approval, AuditEvent, BankTxn, CategoryId, CreditNote, Customer, CustomerPayment, DocLine, Employee, Expense,
  GoodsReceipt, ISODate, Invoice, JournalEntry, JournalLine, Lead, LeaveRequest, MatchException, Notification, PayrollRun,
  Product, PurchaseOrder, Quote, SalesOrder, StockCount, Supplier, SupplierBill, SupplierPayment, Warehouse,
  AutomationRule, OutboxMsg, PrincipalClaim, Settings, Shipment, StockTransfer,
} from "./types";

const SCALE_K = 0.74; // order-size calibration (tuned for ~Rs 110-130M monthly revenue)
const HIST_MONTHS = 15;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Cell { on: number; res: number; val: number; ema: number; incoming: number }
export interface ForecastEvent { name: string; kind: "ramadan" | "eid" | "season"; start: ISODate; end: ISODate }

export interface DB {
  today: ISODate;
  start: ISODate;
  warehouses: Warehouse[];
  suppliers: Supplier[];
  products: Product[];
  customers: Customer[];
  employees: Employee[];
  quotes: Quote[];
  orders: SalesOrder[];
  invoices: Invoice[];
  creditNotes: CreditNote[];
  payments: CustomerPayment[];
  pos: PurchaseOrder[];
  grns: GoodsReceipt[];
  bills: SupplierBill[];
  supplierPayments: SupplierPayment[];
  stockCounts: StockCount[];
  expenses: Expense[];
  leaves: LeaveRequest[];
  payroll: PayrollRun[];
  accounts: Account[];
  journal: JournalEntry[];
  bank: BankTxn[];
  approvals: Approval[];
  audit: AuditEvent[];
  notifications: Notification[];
  leads: Lead[];
  shipments: Shipment[];
  transfers: StockTransfer[];
  claims: PrincipalClaim[];
  rules: AutomationRule[];
  outbox: OutboxMsg[];
  settings: Settings;
  periodStatus: Record<string, "closed" | "soft_closed" | "open">; // overrides computed fiscal-period status
  stock: Map<string, Cell>; // key `${productId}|${warehouseId}`
  calendar: ForecastEvent[];
  bankBalanceAccounts: string[];
  scenario: { khanId: string; alNoorId: string; cityId: string; indusBillId: string; dupBillId: string; lowStock: string[]; lhePcLocation: string };
}

export const ACCOUNTS: Account[] = [
  { code: "1010", name: "Cash in Hand – Head Office", type: "asset", group: "Cash & Bank" },
  { code: "1015", name: "Cash with Salesmen (in transit)", type: "asset", group: "Cash & Bank" },
  { code: "1100", name: "Meezan Bank – Current", type: "asset", group: "Cash & Bank" },
  { code: "1110", name: "HBL – Collection", type: "asset", group: "Cash & Bank" },
  { code: "1120", name: "MCB – Collection", type: "asset", group: "Cash & Bank" },
  { code: "1130", name: "Bank Alfalah – Payroll", type: "asset", group: "Cash & Bank" },
  { code: "1200", name: "Trade Debtors (AR)", type: "asset", group: "Receivables", control: true },
  { code: "1210", name: "Cheques / PDCs in Hand", type: "asset", group: "Receivables" },
  { code: "1300", name: "Stock in Trade", type: "asset", group: "Inventory", control: true },
  { code: "1400", name: "Input Sales Tax", type: "asset", group: "Taxes" },
  { code: "1410", name: "Advance Income Tax u/s 236G", type: "asset", group: "Taxes" },
  { code: "1500", name: "Claims Receivable – Principals", type: "asset", group: "Receivables" },
  { code: "1600", name: "Vehicles & Warehouse Equipment (net)", type: "asset", group: "Fixed Assets" },
  { code: "2010", name: "Trade Creditors (AP)", type: "liability", group: "Payables", control: true },
  { code: "2020", name: "Goods Received Not Invoiced", type: "liability", group: "Payables" },
  { code: "2100", name: "Output Sales Tax Payable", type: "liability", group: "Taxes" },
  { code: "2105", name: "Further Tax Payable", type: "liability", group: "Taxes" },
  { code: "2120", name: "Advance Tax u/s 236H Collected", type: "liability", group: "Taxes" },
  { code: "2130", name: "Income Tax Withheld – Salaries", type: "liability", group: "Taxes" },
  { code: "2140", name: "EOBI / Social Security Payable", type: "liability", group: "Taxes" },
  { code: "2210", name: "Employee Reimbursements Payable", type: "liability", group: "Payables" },
  { code: "2300", name: "Salaries Payable", type: "liability", group: "Payables" },
  { code: "3010", name: "Owner's Capital", type: "equity", group: "Equity" },
  { code: "3020", name: "Director's Drawings", type: "equity", group: "Equity" },
  { code: "3100", name: "Retained Earnings", type: "equity", group: "Equity" },
  { code: "4010", name: "Sales – Gross", type: "income", group: "Revenue" },
  { code: "4020", name: "Sales Returns", type: "income", group: "Revenue" },
  { code: "4030", name: "Trade & Scheme Discounts", type: "income", group: "Revenue" },
  { code: "5010", name: "Cost of Goods Sold", type: "expense", group: "Cost of Sales" },
  { code: "5020", name: "Stock Shrinkage, Damage & Expiry", type: "expense", group: "Cost of Sales" },
  { code: "5030", name: "Purchase Price Variance", type: "expense", group: "Cost of Sales" },
  { code: "5040", name: "Scheme Free-Goods Cost", type: "expense", group: "Cost of Sales" },
  { code: "6010", name: "Salaries & Wages", type: "expense", group: "Operating Expenses" },
  { code: "6015", name: "EOBI – Employer Contribution", type: "expense", group: "Operating Expenses" },
  { code: "6020", name: "Rent", type: "expense", group: "Operating Expenses" },
  { code: "6030", name: "Electricity & Utilities", type: "expense", group: "Operating Expenses" },
  { code: "6040", name: "Fuel & Vehicle Running", type: "expense", group: "Operating Expenses" },
  { code: "6050", name: "Freight Outward", type: "expense", group: "Operating Expenses" },
  { code: "6060", name: "Repairs & Maintenance", type: "expense", group: "Operating Expenses" },
  { code: "6070", name: "Communication & IT", type: "expense", group: "Operating Expenses" },
  { code: "6080", name: "Security Services", type: "expense", group: "Operating Expenses" },
  { code: "6090", name: "Bank Charges", type: "expense", group: "Operating Expenses" },
  { code: "6100", name: "Travel & Entertainment", type: "expense", group: "Operating Expenses" },
  { code: "6110", name: "Printing & Stationery", type: "expense", group: "Operating Expenses" },
  { code: "6990", name: "Miscellaneous Expenses", type: "expense", group: "Operating Expenses" },
];

const WH_OF_CITY: Record<string, string> = {
  Karachi: "KHI-DC1", Hyderabad: "KHI-DC1", Sukkur: "KHI-DC1", Nawabshah: "KHI-DC1",
  Lahore: "LHE-DC", Sialkot: "LHE-DC", Multan: "LHE-DC", Bahawalpur: "LHE-DC",
  Islamabad: "ISB-DC", Rawalpindi: "ISB-DC", Jhelum: "ISB-DC", Abbottabad: "ISB-DC",
  Faisalabad: "FSD-DP",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number, w: number) => String(n).padStart(w, "0");

export function buildDB(): DB {
  const today = todayPK();
  const start = addMonths(today, -HIST_MONTHS);
  const rnd = mulberry32(20261006);
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
  let seq = 0;
  const id = (p: string) => `${p}_${(++seq).toString(36)}`;

  // ───────── master data ─────────
  const warehouses: Warehouse[] = WAREHOUSES.map((w, i) => ({ id: `wh_${w.code}`, ...w, managerId: "" , share: w.share }));
  const whByCode = new Map(warehouses.map((w) => [w.code, w]));

  const suppliers: Supplier[] = SUPPLIERS.map(([code, name, city, province, lead, terms, contact, kind], i) => ({
    id: `sup_${i + 1}`, code, name, city, province, ntn: `${digits(7)}-${int(1, 9)}`, strn: `${pad(int(1, 40), 2)}-00-${digits(4)}-${digits(3)}-${pad(int(1, 99), 2)}`,
    isPrincipal: kind === "goods" && i < 15, leadTimeDays: lead, termsDays: terms, contact,
    phone: `0${pick([21, 42, 51, 41])}-${digits(7)}`, email: `${contact.split(" ")[0]!.toLowerCase().replace(/[^a-z]/g, "")}@${name.split(" ")[0]!.toLowerCase().replace(/[^a-z]/g, "")}.com.pk`, kind,
  }));
  const supByCode = new Map(suppliers.map((s) => [s.code, s]));

  const products: Product[] = [];
  const prefix: Record<CategoryId, string> = { beverages: "BEV", packaged_foods: "PKF", dairy: "DRY", snacks: "SNK", household: "HHD", personal_care: "PRC" };
  for (const cat of CATEGORIES) {
    PRODUCTS[cat.id].forEach((spec, i) => {
      const [brand, nm, size, carton, price, tax, hs, shelf, demand, sup] = spec;
      const cost = r2(price * (0.735 + rnd() * 0.075));
      const mrp = tax === "exempt" ? Math.round(price * 1.1) : Math.ceil((price * 1.14) / 5) * 5;
      products.push({
        id: `p_${prefix[cat.id]}${pad(i + 1, 3)}`, sku: `${prefix[cat.id]}-${pad(i + 1, 3)}`, name: `${brand} ${nm} ${size}`, category: cat.id, brand,
        supplierId: supByCode.get(sup)!.id, cartonSize: carton, price, cost, mrp, taxCategory: tax, hsCode: hs, shelfLifeDays: shelf, dailyDemand: demand,
        safetyDays: 9, barcode: `8964${digits(9)}`,
      });
    });
  }
  const prodIdx = new Map(products.map((p, i) => [p.id, i]));
  const maxDemand = Math.max(...products.map((p) => p.dailyDemand));
  const pop = products.map((p) => 0.15 + 0.85 * Math.sqrt(p.dailyDemand / maxDemand));

  // employees
  const employees: Employee[] = [];
  const used = new Set<string>();
  const mkEmp = (name: string | null, department: string, position: string, branch: string, salary: number, managerId: string | null, female = false, join?: ISODate): Employee => {
    let nm = name;
    while (!nm || used.has(nm)) nm = `${pick(female ? FIRST_NAMES_F : FIRST_NAMES_M)} ${pick(LAST_NAMES)}`;
    used.add(nm);
    const n = employees.length + 1;
    const e: Employee = {
      id: `emp_${n}`, code: `EMP-${pad(n, 4)}`, name: nm, department, position, managerId, branch,
      joinDate: join ?? addDays(start, -int(60, 2200)), salary, status: "active",
      phone: `03${pick([0, 1, 2, 3, 4])}${int(0, 9)}-${digits(7)}`, email: `${nm.toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, ".")}@meridian.demo`,
      cnic: `${pick([42101, 35202, 61101, 37405, 33100])}-${digits(7)}-${int(1, 9)}`,
    };
    employees.push(e); return e;
  };
  const ceo = mkEmp("Tariq Mehmood", "Management", "Chief Executive Officer", "Karachi HO", 850_000, null, false, addDays(start, -3000));
  const fin = mkEmp("Ayesha Siddiqui", "Finance", "Finance Manager", "Karachi HO", 420_000, ceo.id, true, addDays(start, -1800));
  const salesHead = mkEmp("Bilal Ahmed", "Sales", "Head of Sales", "Karachi HO", 480_000, ceo.id, false, addDays(start, -2100));
  const proc = mkEmp("Hina Rauf", "Procurement", "Procurement Manager", "Karachi HO", 340_000, ceo.id, true, addDays(start, -1500));
  const whKhi = mkEmp("Imran Qureshi", "Warehouse & Logistics", "Warehouse Manager – Karachi", "Karachi HO", 260_000, ceo.id, false, addDays(start, -1900));
  mkEmp("Zainab Hussain", "IT & Admin", "IT & Systems Administrator", "Karachi HO", 230_000, ceo.id, true, addDays(start, -900));
  mkEmp("Kashif Raza", "Finance", "Accounts Officer", "Karachi HO", 120_000, fin.id, false, addDays(start, -700));
  for (let i = 0; i < 4; i++) mkEmp(null, "Finance", pick(["Accounts Assistant", "Credit Controller", "Cashier", "Billing Officer"]), "Karachi HO", int(70, 115) * 1000, fin.id, i % 2 === 0);
  const sups: Employee[] = [];
  (["Karachi HO", "Karachi HO", "Lahore", "Islamabad"] as const).forEach((b) => sups.push(mkEmp(null, "Sales", "Sales Supervisor", b, int(150, 190) * 1000, salesHead.id)));
  const reps: Employee[] = [];
  const repPlan: [string, number][] = [["Karachi HO", 9], ["Lahore", 8], ["Islamabad", 5]];
  for (const [b, n] of repPlan) for (let i = 0; i < n; i++) {
    const sup = sups.find((s) => s.branch === b) ?? sups[0]!;
    reps.push(b === "Karachi HO" && i === 0 ? mkEmp("Usman Ghani", "Sales", "Order Booker – Karachi South", b, 88_000, sup.id) : mkEmp(null, "Sales", "Order Booker", b, int(58, 92) * 1000, sup.id));
  }
  const whMgrs = new Map<string, Employee>([["KHI-DC1", whKhi]]);
  for (const w of warehouses.slice(1)) whMgrs.set(w.code, mkEmp(null, "Warehouse & Logistics", "Warehouse Supervisor", w.branch, int(130, 170) * 1000, whKhi.id));
  for (const w of warehouses) w.managerId = whMgrs.get(w.code)!.id;
  for (let i = 0; i < 16; i++) mkEmp(null, "Warehouse & Logistics", pick(["Driver", "Driver", "Loader", "Store Keeper", "Dispatch Clerk"]), pick(["Karachi HO", "Karachi HO", "Lahore", "Islamabad"]), int(42, 66) * 1000, whKhi.id);
  mkEmp(null, "Procurement", "Procurement Officer", "Karachi HO", 135_000, proc.id, true);
  mkEmp(null, "Procurement", "Purchase Coordinator", "Lahore", 110_000, proc.id);
  for (let i = 0; i < 3; i++) mkEmp(null, "HR & Admin", pick(["HR Officer", "Admin Officer", "Office Assistant"]), "Karachi HO", int(65, 130) * 1000, ceo.id, true);
  mkEmp(null, "IT & Admin", "Support Engineer", "Karachi HO", 95_000, ceo.id);
  employees.find((e) => e.name === "Kashif Raza")!.status = "active";
  employees[employees.length - 4]!.status = "probation";
  employees[20]!.status = "on_leave";

  // customers
  const customers: Customer[] = CUSTOMERS.map((c, i) => {
    const [name, channel, city, province, area, creditLimit, termsDays, profile, registered, atl, size] = c;
    const wh = WH_OF_CITY[city] ?? "KHI-DC1";
    const branch = wh === "LHE-DC" || wh === "FSD-DP" ? "Lahore" : wh === "ISB-DC" ? "Islamabad" : "Karachi HO";
    const pool = reps.filter((r) => r.branch === branch);
    const rep = name === "Metro Mart" || name === "Al-Rehman Store" ? reps[0]! : pick(pool);
    const warehouseId = wh === "KHI-DC1" && channel === "modern_trade" && i % 3 === 2 ? "wh_KHI-DC2" : `wh_${wh}`;
    const person = `${pick(FIRST_NAMES_M)} ${pick(LAST_NAMES)}`;
    return {
      id: `cus_${i + 1}`, code: `CUS-${pad(i + 1, 4)}`, name, channel, city, province, area,
      ntn: registered ? `${digits(7)}-${int(1, 9)}` : null, strn: registered ? `${pad(int(1, 40), 2)}-00-${digits(4)}-${digits(3)}-${pad(int(1, 99), 2)}` : null,
      cnic: registered ? null : `${pick([42101, 35202, 61101, 37405])}-${digits(7)}-${int(1, 9)}`,
      registered, atl, creditLimit, termsDays, repId: rep.id, warehouseId, status: "active", profile,
      contact: person, phone: `03${pick([0, 1, 2, 3])}${int(0, 9)}-${digits(7)}`, email: `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "")}@mail.pk`,
      since: addDays(start, -int(120, 2500)), size: name === "Khan Brothers Traders" ? 0.32 : size,
    };
  });
  const cusByName = (n: string) => customers.find((c) => c.name === n)!;
  const khan = cusByName("Khan Brothers Traders");
  const alNoor = cusByName("Al-Noor Super Store");
  const cityCC = cusByName("City Cash & Carry");
  const prime = cusByName("Prime Retailers");

  // ───────── state ─────────
  const stock = new Map<string, Cell>();
  const key = (p: string, w: string) => `${p}|${w}`;
  const cellOf = (p: string, w: string) => { let c = stock.get(key(p, w)); if (!c) { c = { on: 0, res: 0, val: 0, ema: 0, incoming: 0 }; stock.set(key(p, w), c); } return c; };

  const orders: SalesOrder[] = [], invoices: Invoice[] = [], payments: CustomerPayment[] = [], creditNotes: CreditNote[] = [];
  const pos: PurchaseOrder[] = [], grns: GoodsReceipt[] = [], bills: SupplierBill[] = [], supplierPayments: SupplierPayment[] = [];
  const journal: JournalEntry[] = [], expenses: Expense[] = [], stockCounts: StockCount[] = [];
  const invById = new Map<string, Invoice>();
  let jeN = 0;
  const je = (date: ISODate, memo: string, source: string, lines: JournalLine[], type: JournalEntry["type"] = "auto", postedBy = "System") => {
    const ls = lines.filter((l) => l.debit || l.credit).map((l) => ({ account: l.account, debit: r2(l.debit), credit: r2(l.credit) }));
    const d = r2(ls.reduce((s, l) => s + l.debit, 0)), c = r2(ls.reduce((s, l) => s + l.credit, 0));
    if (Math.abs(d - c) > 0.011) throw new Error(`Unbalanced JE ${memo}: ${d} vs ${c}`);
    if (ls.length) journal.push({ id: `je_${++jeN}`, number: `JE-${pad(jeN, 6)}`, date, memo, source, type, lines: ls, postedBy });
  };

  const priceFactor = (d: ISODate) => 1 - 0.0055 * Math.min(HIST_MONTHS, diffDays(today, d) / 30.4);
  const supInc = (p: Product, d: ISODate) => (p.supplierId === supByCode.get("SUP-001")!.id && diffDays(today, d) < 35 ? 1.07 : 1) * (p.supplierId === supByCode.get("SUP-007")!.id && diffDays(today, d) < 200 ? 1.05 : 1);

  // ramadan / season calendar
  const calendar: ForecastEvent[] = [
    { name: "Ramadan 2026", kind: "ramadan", start: "2026-02-18", end: "2026-03-19" },
    { name: "Eid ul-Fitr 2026", kind: "eid", start: "2026-03-20", end: "2026-03-23" },
    { name: "Eid ul-Adha 2026", kind: "eid", start: "2026-05-27", end: "2026-05-30" },
    { name: "Summer peak", kind: "season", start: "2026-05-01", end: "2026-08-31" },
    { name: "Ramadan 2027", kind: "ramadan", start: "2027-02-08", end: "2027-03-09" },
  ];
  const inCal = (d: ISODate, name: string) => calendar.some((e) => e.name.startsWith(name) && d >= e.start && d <= e.end);
  const season = (p: Product, d: ISODate): number => {
    let m = 1;
    const mo = +d.slice(5, 7);
    const n = p.name;
    if (inCal(d, "Ramadan")) { if (/Sharbat|Squash/.test(n)) m *= 3; if (/Dates/.test(n)) m *= 4; if (/Ghee|Oil/.test(n)) m *= 1.4; if (p.category === "beverages") m *= 1.2; if (/Biryani|Masala|Dahi/.test(n)) m *= 1.15; }
    if (inCal(d, "Eid ul-Adha") && /Masala|Chilli|Haldi|Ghee|Oil/.test(n)) m *= 1.8;
    if (mo >= 5 && mo <= 8 && /Water|Cola|Lemon|Orange|Nectar|Juice|Lassi|Energy/.test(n)) m *= 1.45;
    if ((mo >= 11 || mo <= 2) && /Tea|Whitener|Coffee|Milk Powder|Desi Ghee/.test(n)) m *= 1.3;
    if ((mo === 8 || mo === 9) && p.category === "snacks") m *= 1.1;
    return m;
  };

  // order generation (pure: no stock)
  const orderProb: Record<string, number> = { modern_trade: 0.55, wholesale: 0.36, retail: 0.2, sub_distributor: 0.25, horeca: 0.3 };
  const totalPop = pop.reduce((a, b) => a + b, 0);
  function desiredLines(c: Customer, d: ISODate, r: () => number): { pi: number; cartons: number }[] {
    const k = Math.max(3, Math.min(26, Math.round(4 + c.size * 3.2 + r() * 5)));
    const out: { pi: number; cartons: number }[] = [];
    const seen = new Set<number>();
    let guard = 0;
    while (out.length < k && guard++ < 200) {
      let t = r() * totalPop, pi = 0;
      for (; pi < pop.length - 1; pi++) { t -= pop[pi]!; if (t <= 0) break; }
      if (seen.has(pi)) continue;
      const p = products[pi]!;
      if (c.channel === "retail" && p.cartonSize > 150 && r() < 0.5) continue;
      seen.add(pi);
      let m = SCALE_K * c.size * Math.sqrt(p.dailyDemand / p.cartonSize) * (0.55 + r() * 0.9) * season(p, d);
      const dAgo = diffDays(today, d);
      m *= 1 + 0.0004 * (HIST_MONTHS * 30 - dAgo) + (dAgo < 30 ? 0.24 : 0);
      if (p.category === "snacks" && dAgo < 56 && (c.channel === "modern_trade" || c.channel === "wholesale") && /Karachi|Lahore/.test(c.city)) m *= 1.23;
      if (p.name.startsWith("NestFresh Mineral Water 1L") && dAgo < 30 && c.warehouseId === "wh_KHI-DC1") m *= 1.17;
      out.push({ pi, cartons: Math.max(1, Math.round(m)) });
    }
    return out;
  }
  const isOpenDay = (d: ISODate) => weekday(d) !== 0 && !["2025-08-14", "2025-12-25", "2026-03-23", "2026-05-01"].includes(d);

  // warm-up pass → opening stock and EMA
  const whIds = warehouses.map((w) => w.id);
  const warm = mulberry32(777);
  const warmSum = new Map<string, number>();
  for (let i = 1; i <= 28; i++) {
    const d = addDays(start, -i);
    if (!isOpenDay(d)) continue;
    for (const c of customers) if (warm() < (orderProb[c.channel] ?? 0.2)) for (const l of desiredLines(c, d, warm)) {
      const k = key(products[l.pi]!.id, c.warehouseId);
      warmSum.set(k, (warmSum.get(k) ?? 0) + l.cartons * products[l.pi]!.cartonSize);
    }
  }
  for (const p of products) for (const w of whIds) {
    const c = cellOf(p.id, w);
    c.ema = (warmSum.get(key(p.id, w)) ?? 0) / 28;
    const lead = p.supplierId ? suppliers.find((s) => s.id === p.supplierId)!.leadTimeDays : 8;
    const qty = Math.ceil((c.ema * (lead + 18)) / p.cartonSize) * p.cartonSize;
    c.on = qty; c.val = r2(qty * p.cost * priceFactor(start) * supInc(p, start));
  }
  const openVal = r2([...stock.values()].reduce((s, c) => s + c.val, 0));

  // opening journal
  const bankOpen = 62_000_000;
  je(addDays(start, -1), "Opening balances", "Opening", [
    { account: "1100", debit: bankOpen * 0.45, credit: 0 }, { account: "1110", debit: bankOpen * 0.2, credit: 0 }, { account: "1120", debit: bankOpen * 0.15, credit: 0 },
    { account: "1130", debit: bankOpen * 0.2, credit: 0 }, { account: "1010", debit: 600_000, credit: 0 }, { account: "1300", debit: openVal, credit: 0 },
    { account: "1600", debit: 21_500_000, credit: 0 },
    { account: "3010", debit: 0, credit: 40_000_000 }, { account: "3100", debit: 0, credit: bankOpen + 600_000 + openVal + 21_500_000 - 40_000_000 },
  ], "opening", "Ayesha Siddiqui");

  // ───────── daily loop ─────────
  const arrivals = new Map<ISODate, { poIdx: number; frac: number; second?: boolean }[]>();
  const pendingDispatch: SalesOrder[] = [];
  const payQueue: { date: ISODate; pay: CustomerPayment; inv: Invoice; clearOn?: ISODate }[] = [];
  let soN = 20000, invN = 10000, poN = 5000, grnN = 9000, payN = 4000, billN = 7000, cnN = 300, spN = 2000, exN = 1000;
  const skipSkus = ["NestFresh Mineral Water 1L", "Crunchos Masala Chips 50g", "Crescent Tea Whitener 200g"];
  const skipKey = new Set(skipSkus.map((n) => products.find((p) => p.name === n)!.id + "|" + (n.startsWith("NestFresh") ? "wh_KHI-DC1" : n.startsWith("Crunchos") ? "wh_LHE-DC" : "wh_ISB-DC")));
  const billSerial = new Map<string, number>();
  const avgCostRate = (c: Cell) => (c.on > 0 ? c.val / c.on : 0);

  const profileDelay = (c: Customer, inv: Invoice, r: () => number): number => {
    const T = c.termsDays;
    switch (c.profile) {
      case "prompt": return Math.round(T * (0.6 + r() * 0.4));
      case "normal": return Math.round(T * (0.85 + r() * 0.35)) + int(0, 3);
      case "slow": return Math.round(T * (1.15 + r() * 0.55)) + int(2, 10);
      case "deteriorating": return diffDays(today, inv.date) < 100 ? Math.round(T * (1.4 + r() * 1.0)) + int(8, 22) : Math.round(T * (0.9 + r() * 0.3));
      case "risky": return Math.round(T * (1.1 + r() * 0.8)) + int(3, 12);
    }
  };

  const issuedToday = new Map<Cell, number>();
  const mainRnd = mulberry32(424242);
  const rr = mainRnd;
  const ri = (a: number, b: number) => a + Math.floor(rr() * (b - a + 1));
  const bankOf = (c: Customer): string => (c.channel === "modern_trade" ? pick(["1100", "1110"]) : pick(["1110", "1120"]));
  const dateLag = (d: ISODate, n: number) => addDays(d, n);

  function postReceipt(po: PurchaseOrder, frac: number, d: ISODate) {
    const lines = po.lines.map((l) => {
      const q = Math.round((l.qty * frac) / products[prodIdx.get(l.productId)!]!.cartonSize) * products[prodIdx.get(l.productId)!]!.cartonSize;
      return { l, q: Math.min(q, l.qty - l.received) };
    }).filter((x) => x.q > 0);
    if (!lines.length) return;
    const g: GoodsReceipt = { id: `grn_${++grnN}`, number: `GRN-${grnN}`, poId: po.id, supplierId: po.supplierId, warehouseId: po.warehouseId, date: d, lines: [], value: 0 };
    let value = 0;
    for (const { l, q } of lines) {
      const p = products[prodIdx.get(l.productId)!]!;
      const c = cellOf(p.id, po.warehouseId);
      const v = r2(q * l.price);
      c.on += q; c.val = r2(c.val + v); c.incoming -= q; l.received += q; value += v;
      g.lines.push({ productId: p.id, qty: q, batch: `B${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${p.sku.slice(-3)}`, expiry: addDays(d, Math.round(p.shelfLifeDays * (0.78 + rr() * 0.1))) });
    }
    g.value = r2(value); grns.push(g);
    je(d, `Goods receipt ${g.number} – ${po.number}`, `GRN ${g.number}`, [{ account: "1300", debit: g.value, credit: 0 }, { account: "2020", debit: 0, credit: g.value }]);
    po.status = po.lines.every((l) => l.received >= l.qty) ? "received" : "partially_received";
    // supplier bill 1-4 days later (queued)
    const bd = addDays(d, ri(1, 4));
    scheduledBills.push({ date: bd, po, grn: g });
  }
  const scheduledBills: { date: ISODate; po: PurchaseOrder; grn: GoodsReceipt }[] = [];

  function postBill(po: PurchaseOrder | null, grn: GoodsReceipt | null, d: ISODate, supplierId: string, lines: SupplierBill["lines"], opts: Partial<SupplierBill> & { invNo?: string } = {}): SupplierBill {
    const sup = suppliers.find((s) => s.id === supplierId)!;
    const sub = r2(lines.reduce((s, l) => s + l.total, 0));
    let tax = 0;
    for (const l of lines) { const p = l.productId ? products[prodIdx.get(l.productId)!]! : null; if (p && p.taxCategory !== "exempt") tax += p.taxCategory === "standard" ? l.total * 0.18 : 0.18 * p.mrp * l.qty * 0.96; }
    tax = r2(tax);
    const wht = r2((sub + tax) * 0.001);
    const n = (billSerial.get(sup.id) ?? 20000 + ri(0, 3000)) + ri(1, 40); billSerial.set(sup.id, n);
    const prefixInv = sup.name.split(/[ .]/)[0]!.slice(0, 2).toUpperCase();
    const bill: SupplierBill = {
      id: `bill_${++billN}`, number: `SB-${billN}`, supplierInvoiceNo: opts.invNo ?? `${prefixInv}-${n}`, supplierId, poId: po?.id ?? null, date: d, dueDate: addDays(d, sup.termsDays),
      lines, subtotal: sub, tax, wht236g: wht, total: r2(sub + tax + wht), paid: 0, status: "posted", exceptions: [], source: "manual", ...opts,
    };
    bills.push(bill);
    const grniAmt = grn ? Math.min(grn.value, sub) : 0;
    const ppv = r2(sub - grniAmt);
    if (bill.status !== "exception" && bill.status !== "pending_match") {
      if (po) je(d, `Supplier bill ${bill.supplierInvoiceNo}`, `Bill ${bill.number}`, [
        { account: "2020", debit: grniAmt, credit: 0 }, { account: "5030", debit: Math.max(ppv, 0), credit: Math.max(-ppv, 0) }, { account: "1400", debit: tax, credit: 0 }, { account: "1410", debit: wht, credit: 0 }, { account: "2010", debit: 0, credit: bill.total },
      ]);
    }
    return bill;
  }

  const expenseDefs: [string, string, number, string][] = [
    ["6020", "Rent", 1_450_000, "Al-Hamd Properties"], ["6080", "Security", 340_000, "Shield Security Services"], ["6070", "Communication & IT", 215_000, "TechServe IT Solutions"],
  ];

  const payrollRuns: PayrollRun[] = [];
  for (let d = addDays(start, 0); d <= today; d = addDays(d, 1)) {
    // 1. receipts
    const arr = arrivals.get(d);
    if (arr) for (const a of arr) postReceipt(pos[a.poIdx]!, a.frac, d);
    // bills
    for (let i = scheduledBills.length - 1; i >= 0; i--) {
      const sb = scheduledBills[i]!;
      if (sb.date > d) continue;
      scheduledBills.splice(i, 1);
      const lines = sb.grn.lines.map((gl) => { const pl = sb.po.lines.find((l) => l.productId === gl.productId)!; return { productId: gl.productId, description: products[prodIdx.get(gl.productId)!]!.name, qty: gl.qty, price: pl.price, total: r2(gl.qty * pl.price) }; });
      postBill(sb.po, sb.grn, d, sb.po.supplierId, lines);
    }
    // 2. dispatch yesterday's orders → invoices
    {
      while (pendingDispatch.length && pendingDispatch[0]!.date < d) {
        const so = pendingDispatch.shift()!;
        if (so.status === "cancelled") continue;
        dispatch(so, d);
      }
    }
    // 3. new orders
    if (isOpenDay(d)) {
      for (const c of customers) {
        if (rr() >= (orderProb[c.channel] ?? 0.2)) continue;
        const want = desiredLines(c, d, rr);
        const lines: DocLine[] = [];
        for (const w of want) {
          const p = products[w.pi]!;
          const cell = cellOf(p.id, c.warehouseId);
          let qty = w.cartons * p.cartonSize;
          qty = Math.min(qty, Math.floor((cell.on - cell.res) / p.cartonSize) * p.cartonSize);
          if (qty <= 0) continue;
          const chPrice = { modern_trade: 0.97, wholesale: 0.985, retail: 1, sub_distributor: 0.96, horeca: 1 }[c.channel];
          const promo = p.category === "beverages" && diffDays(today, d) < 38 ? 0.95 : 1;
          const price = r2(p.price * chPrice * promo * priceFactor(d));
          const disc = rr() < 0.18 ? r2(qty * price * pick([0.01, 0.015, 0.02])) : 0;
          const value = r2(qty * price - disc);
          const tax = p.taxCategory === "exempt" ? 0 : p.taxCategory === "standard" ? r2(value * 0.18) : r2(0.18 * p.mrp * priceFactor(d) * qty);
          lines.push({ productId: p.id, qty, price, discount: disc, value, salesTax: tax });
          cell.res += qty;
          const sch = SCHEMES.find((s) => p.brand === s.productBrand && /Mineral Water|Masala Chips/.test(p.name));
          if (sch && qty / p.cartonSize >= sch.buy) {
            const fq = Math.floor(qty / p.cartonSize / sch.buy) * sch.free * p.cartonSize;
            if (cell.on - cell.res >= fq) { lines.push({ productId: p.id, qty: fq, price: 0, discount: 0, value: 0, salesTax: 0, free: true, schemeId: sch.id }); cell.res += fq; }
          }
        }
        if (!lines.length) continue;
        const so = mkOrder(c, d, lines);
        orders.push(so); pendingDispatch.push(so);
      }
    }
    // 4. replenishment (Mondays)
    if (weekday(d) === 1 && d < addDays(today, 0)) {
      const weekNo = Math.floor(diffDays(d, start) / 7);
      for (const s of suppliers) {
        if (s.kind !== "goods") continue;
        for (const w of warehouses) {
          const big = w.code === "KHI-DC1" || w.code === "LHE-DC";
          if ((weekNo + suppliers.indexOf(s)) % (big ? 1 : 2) !== 0) continue;
          const lines: PurchaseOrder["lines"] = [];
          for (const p of products.filter((x) => x.supplierId === s.id)) {
            const c = cellOf(p.id, w.id);
            if (diffDays(today, d) < 21 && skipKey.has(key(p.id, w.id))) continue;
            const cyc = big ? 7 : 14;
            const target = c.ema * (s.leadTimeDays + cyc + 16), pos_ = c.on - c.res + c.incoming;
            if (c.ema > 0.04 && pos_ < c.ema * (s.leadTimeDays + cyc + 7)) {
              const qty = Math.ceil((target - pos_) / p.cartonSize) * p.cartonSize;
              if (qty > 0) lines.push({ productId: p.id, qty, price: r2(p.cost * priceFactor(d) * supInc(p, d)), received: 0 });
            }
          }
          if (!lines.length) continue;
          const sub = r2(lines.reduce((a, l) => a + l.qty * l.price, 0));
          const eta = addDays(d, Math.max(2, s.leadTimeDays + ri(-2, 3)));
          const po: PurchaseOrder = { id: `po_${++poN}`, number: `PO-${poN}`, supplierId: s.id, warehouseId: w.id, date: d, expectedDate: eta, status: "approved", lines, subtotal: sub, tax: r2(sub * 0.17), total: r2(sub * 1.17), source: rr() < 0.3 ? "reorder_rule" : "user" };
          pos.push(po);
          const idx = pos.length - 1;
          for (const l of lines) cellOf(l.productId, w.id).incoming += l.qty;
          const split = rr() < 0.05;
          const push = (dt: ISODate, frac: number) => { if (!arrivals.has(dt)) arrivals.set(dt, []); arrivals.get(dt)!.push({ poIdx: idx, frac }); };
          if (split) { push(eta, 0.7); push(addDays(eta, 5), 1); } else push(eta, 1);
        }
      }
    }
    // 5. customer payments due today
    for (let i = payQueue.length - 1; i >= 0; i--) {
      const q = payQueue[i]!;
      if (q.date > d) continue;
      payQueue.splice(i, 1);
      applyPayment(q.pay, q.inv, d, q.clearOn);
    }
    // 6. supplier payments
    for (const b of bills) {
      if (b.paid >= b.total || b.status === "exception" || b.status === "pending_match") continue;
      const sup = suppliers.find((s) => s.id === b.supplierId)!;
      if (b.dueDate + "" <= d && !(b as SupplierBill & { _sched?: boolean })._sched) {
        const payDate = addDays(b.dueDate, ri(-2, 9));
        (b as SupplierBill & { _sched?: boolean })._sched = true;
        (b as SupplierBill & { _payDate?: ISODate })._payDate = payDate;
      }
      const pd = (b as SupplierBill & { _payDate?: ISODate })._payDate;
      if (pd && pd <= d && b.paid === 0) {
        b.paid = b.total; b.status = "paid";
        const bank = pick(["1100", "1100", "1110"]);
        spN++;
        supplierPayments.push({ id: `sp_${spN}`, number: `SPY-${spN}`, supplierId: sup.id, date: d, amount: b.total, method: b.total > 500_000 ? "bank_transfer" : pick(["bank_transfer", "cheque"]), billIds: [b.id] });
        je(d, `Payment to ${sup.name}`, `Supplier payment SPY-${spN}`, [{ account: "2010", debit: b.total, credit: 0 }, { account: bank, debit: 0, credit: b.total }]);
      }
    }
    for (const c of stock.values()) c.ema = c.ema * 0.965 + (issuedToday.get(c) ?? 0) * 0.035;
    issuedToday.clear();
    // 7. month start: payroll, rent etc.
    if (d.endsWith("-01") || (d === start)) monthStart(d);
    if (d.slice(8) === "15") monthMid(d);
    if (d === endOfMonth(d)) monthEndExpenses(d);
  }

  function mkOrder(c: Customer, d: ISODate, lines: DocLine[]): SalesOrder {
    const subtotal = r2(lines.reduce((s, l) => s + l.value + l.discount, 0));
    const discount = r2(lines.reduce((s, l) => s + l.discount, 0));
    const tax = r2(lines.reduce((s, l) => s + l.salesTax, 0));
    const so: SalesOrder = { id: `so_${++soN}`, number: `SO-${soN}`, customerId: c.id, repId: c.repId, warehouseId: c.warehouseId, date: d, status: "reserved", lines, subtotal, discount, tax, total: r2(subtotal - discount + tax), invoiceId: null, source: "user" };
    if (rr() < 0.012) so.status = "cancelled";
    return so;
  }

  function dispatch(so: SalesOrder, d: ISODate) {
    const c = customers.find((x) => x.id === so.customerId)!;
    let cogs = 0, freeCogs = 0;
    for (const l of so.lines) {
      const cell = cellOf(l.productId, so.warehouseId);
      const v = cell.on > 0 ? r2((cell.val * l.qty) / cell.on) : 0;
      cell.on -= l.qty; cell.res -= l.qty; cell.val = r2(cell.val - v);
      issuedToday.set(cell, (issuedToday.get(cell) ?? 0) + l.qty);
      if (l.free) freeCogs += v; else cogs += v;
    }
    cogs = r2(cogs); freeCogs = r2(freeCogs);
    const value = r2(so.lines.reduce((s, l) => s + l.value, 0));
    const gross = r2(so.lines.reduce((s, l) => s + l.value + l.discount, 0));
    const furtherTax = !c.registered || !c.atl ? r2(value * 0.04) : 0;
    const wht = c.channel === "retail" || c.channel === "wholesale" || c.channel === "sub_distributor" ? r2((value + so.tax) * (c.atl ? 0.005 : c.channel === "retail" ? 0.025 : 0.01)) : 0;
    const total = r2(value + so.tax + furtherTax + wht);
    const inv: Invoice = {
      id: `inv_${++invN}`, number: `INV-${invN}`, customerId: c.id, orderId: so.id, warehouseId: so.warehouseId, date: d, dueDate: addDays(d, c.termsDays),
      lines: so.lines, subtotal: gross, discount: so.discount, salesTax: so.tax, furtherTax, wht236h: wht, total, paid: 0, cogs: r2(cogs + freeCogs),
      status: "sent", paymentStatus: "unpaid", fbr: { status: "simulated", irn: `SIM-${d.replace(/-/g, "")}-${pad(invN, 6)}`, at: d },
    };
    invoices.push(inv); invById.set(inv.id, inv);
    so.invoiceId = inv.id; so.status = "fulfilled";
    je(d, `Sales invoice ${inv.number} – ${c.name}`, `Invoice ${inv.number}`, [
      { account: "1200", debit: total, credit: 0 }, { account: "4030", debit: so.discount, credit: 0 }, { account: "4010", debit: 0, credit: gross },
      { account: "2100", debit: 0, credit: so.tax }, { account: "2105", debit: 0, credit: furtherTax }, { account: "2120", debit: 0, credit: wht },
      { account: "5010", debit: cogs, credit: 0 }, { account: "5040", debit: freeCogs, credit: 0 }, { account: "1300", debit: 0, credit: r2(cogs + freeCogs) },
    ]);
    // payment schedule
    const stopped = c.id === khan.id && diffDays(today, d) < 100;
    if (!stopped) {
      let delay = profileDelay(c, inv, rr);
      const split = rr() < 0.08;
      const amounts = split ? [r2(total * 0.6), r2(total - r2(total * 0.6))] : [total];
      amounts.forEach((amt, k) => {
        const pd = addDays(d, delay + k * 14);
        if (pd > today) return;
        const method = payMethod(c);
        const bounce = (c.profile === "risky" && method !== "cash" && method !== "bank_transfer" && rr() < 0.08);
        const pay: CustomerPayment = { id: `pay_${++payN}`, number: `RCP-${payN}`, customerId: c.id, date: pd, method, amount: amt, status: "cleared", allocations: [] };
        if (method === "cheque" || method === "pdc") { pay.chequeNo = digits(6); pay.bank = pick(BANKS); }
        const clearOn = method === "cheque" || method === "pdc" ? addDays(pd, ri(1, 4)) : undefined;
        payQueue.push({ date: pd, pay: bounce ? { ...pay, status: "bounced" } : pay, inv, clearOn });
      });
    } else if (c.id === khan.id) {
      // Khan Brothers: two bounced cheques in the last 120 days (against older invoices)
    }
    // credit notes (~1%)
    if (rr() < 0.01 && value > 20_000) {
      const frac = pick([0.05, 0.08, 0.12]);
      const cnDate = addDays(d, ri(3, 10));
      if (cnDate <= today) {
        const sub = r2(value * frac), tx = r2(so.tax * frac);
        creditNotes.push({ id: `cn_${++cnN}`, number: `CN-${cnN}`, invoiceId: inv.id, customerId: c.id, date: cnDate, reason: pick(["expired", "damaged", "price_difference", "short_delivery"] as const), subtotal: sub, tax: tx, total: r2(sub + tx) });
        inv.paid = r2(inv.paid + sub + tx);
        je(cnDate, `Credit note CN-${cnN} against ${inv.number}`, `Credit note CN-${cnN}`, [{ account: "4020", debit: sub, credit: 0 }, { account: "2100", debit: tx, credit: 0 }, { account: "1200", debit: 0, credit: r2(sub + tx) }]);
      }
    }
  }

  function payMethod(c: Customer): CustomerPayment["method"] {
    const r = rr();
    if (c.channel === "modern_trade") return r < 0.85 ? "bank_transfer" : "cheque";
    if (c.channel === "wholesale") return r < 0.4 ? "pdc" : r < 0.65 ? "cheque" : r < 0.9 ? "bank_transfer" : "cash";
    if (c.channel === "sub_distributor") return r < 0.6 ? "bank_transfer" : "cheque";
    if (c.channel === "horeca") return r < 0.5 ? "bank_transfer" : "cash";
    return r < 0.65 ? "cash" : r < 0.85 ? "bank_transfer" : "cheque";
  }

  function applyPayment(pay: CustomerPayment, inv: Invoice, d: ISODate, clearOn?: ISODate) {
    const c = customers.find((x) => x.id === pay.customerId)!;
    const bank = bankOf(c);
    pay.date = d;
    if (pay.status === "bounced") {
      payments.push(pay);
      je(d, `Cheque ${pay.chequeNo} received – ${c.name}`, `Receipt ${pay.number}`, [{ account: "1210", debit: pay.amount, credit: 0 }, { account: "1200", debit: 0, credit: pay.amount }]);
      const bd = addDays(d, 3);
      je(bd, `Cheque ${pay.chequeNo} bounced – ${c.name}`, `Receipt ${pay.number}`, [{ account: "1200", debit: pay.amount, credit: 0 }, { account: "1210", debit: 0, credit: pay.amount }, { account: "6090", debit: 2500, credit: 0 }, { account: bank, debit: 0, credit: 2500 }]);
      // re-pay by bank transfer ~18 days later if still within range
      const rd = addDays(d, 18);
      if (rd <= today && !(c.id === khan.id && diffDays(today, d) < 130)) payQueue.push({ date: rd, pay: { id: `pay_${++payN}`, number: `RCP-${payN}`, customerId: c.id, date: rd, method: "bank_transfer", amount: pay.amount, status: "cleared", allocations: [] }, inv });
      return;
    }
    const outstanding = r2(inv.total - inv.paid);
    const amt = Math.min(pay.amount, outstanding);
    if (amt <= 0) return;
    pay.amount = amt;
    pay.allocations = [{ invoiceId: inv.id, amount: amt }];
    inv.paid = r2(inv.paid + amt);
    inv.paymentStatus = inv.paid >= inv.total - 0.01 ? "paid" : "partially_paid";
    if (pay.method === "cash") {
      je(d, `Cash receipt ${pay.number} – ${c.name}`, `Receipt ${pay.number}`, [{ account: "1015", debit: amt, credit: 0 }, { account: "1200", debit: 0, credit: amt }]);
      const dep = addDays(d, ri(1, 2));
      if (dep <= today) je(dep, `Salesman deposit – ${pay.number}`, `Receipt ${pay.number}`, [{ account: bank, debit: amt, credit: 0 }, { account: "1015", debit: 0, credit: amt }]);
    } else if (pay.method === "bank_transfer") {
      je(d, `Bank transfer ${pay.number} – ${c.name}`, `Receipt ${pay.number}`, [{ account: bank, debit: amt, credit: 0 }, { account: "1200", debit: 0, credit: amt }]);
    } else {
      je(d, `Cheque ${pay.chequeNo} received – ${c.name}`, `Receipt ${pay.number}`, [{ account: "1210", debit: amt, credit: 0 }, { account: "1200", debit: 0, credit: amt }]);
      const co = clearOn ?? addDays(d, 3);
      if (co <= today) je(co, `Cheque ${pay.chequeNo} cleared`, `Receipt ${pay.number}`, [{ account: bank, debit: amt, credit: 0 }, { account: "1210", debit: 0, credit: amt }]);
      else pay.status = pay.method === "pdc" ? "in_hand" : "deposited";
    }
    payments.push(pay);
  }

  function monthStart(d: ISODate) {
    if (d === start) return;
    // payroll for previous month
    const pm = monthKey(addMonths(d, -1));
    const active = employees.filter((e) => e.joinDate < d);
    const gross = r2(active.reduce((s, e) => s + e.salary * (1 + (e.department === "Sales" && e.position.startsWith("Order") ? 0.12 : 0)), 0));
    const tax = r2(gross * 0.045), eobi = r2(active.length * 370 * 2);
    const net = r2(gross - tax - r2(active.length * 370));
    je(d, `Payroll ${pm}`, `Payroll ${pm}`, [{ account: "6010", debit: gross, credit: 0 }, { account: "6015", debit: r2(active.length * 370), credit: 0 }, { account: "2300", debit: 0, credit: net }, { account: "2130", debit: 0, credit: tax }, { account: "2140", debit: 0, credit: eobi }], "auto", "Ayesha Siddiqui");
    je(addDays(d, 1), `Salaries paid ${pm}`, `Payroll ${pm}`, [{ account: "2300", debit: net, credit: 0 }, { account: "1130", debit: 0, credit: net }]);
    payrollRuns.push({ month: pm, gross, tax, eobi, net, headcount: active.length, status: "posted" });
    // rent etc
    for (const [acc, nm, amt, who] of expenseDefs) je(addDays(d, 2), `${nm} – ${who}`, `Expense ${nm}`, [{ account: acc, debit: amt, credit: 0 }, { account: "1100", debit: 0, credit: amt }]);
  }
  function monthMid(d: ISODate) {
    const mo = +d.slice(5, 7);
    const util = Math.round((mo >= 5 && mo <= 9 ? 1_150_000 : 720_000) * (0.92 + rr() * 0.16));
    je(d, "Electricity & utilities – all sites", "Expense Utilities", [{ account: "6030", debit: util, credit: 0 }, { account: "1100", debit: 0, credit: util }]);
  }
  function monthEndExpenses(d: ISODate) {
    const rev = invoices.filter((i) => monthKey(i.date) === monthKey(d)).reduce((s, i) => s + i.subtotal, 0);
    const fuel = Math.round(rev * 0.0105 * (0.9 + rr() * 0.2)), freight = Math.round(rev * 0.0072 * (0.9 + rr() * 0.2));
    je(d, "Fuel & vehicle running", "Expense Fuel", [{ account: "6040", debit: fuel, credit: 0 }, { account: "1110", debit: 0, credit: fuel }]);
    je(d, "Freight outward – contractors", "Expense Freight", [{ account: "6050", debit: freight, credit: 0 }, { account: "1110", debit: 0, credit: freight }]);
    const base = Math.round(380_000 * (0.8 + rr() * 0.5));
    const parts: [string, number][] = [["6060", Math.round(base * 0.35)], ["6110", Math.round(base * 0.15)], ["6100", Math.round(base * 0.2)], ["6090", Math.round(base * 0.3)]];
    const misc = parts.reduce((s, [, v]) => s + v, 0);
    je(d, "Repairs, printing, entertainment, bank charges", "Expense Misc", [...parts.map(([account, debit]) => ({ account, debit, credit: 0 })), { account: "1100", debit: 0, credit: misc }]);
  }
  const payroll = payrollRuns;

  // ───────── order status for open orders ─────────
  let oi = 0;
  for (const so of orders) {
    if (so.status === "cancelled") continue;
    if (!so.invoiceId) so.status = oi++ % 5 < 2 ? "confirmed" : "reserved";
  }
  // release reservations for cancelled orders
  for (const so of orders) if (so.status === "cancelled") for (const l of so.lines) { const c = cellOf(l.productId, so.warehouseId); c.res = Math.max(0, c.res - l.qty); }

  // invoice paymentStatus for credit-note-only changes
  for (const i of invoices) if (i.paid >= i.total - 0.01) i.paymentStatus = "paid"; else if (i.paid > 0) i.paymentStatus = "partially_paid";

  // ───────── scenarios & injected documents ─────────
  const sunridge = suppliers.find((s) => s.code === "SUP-007")!;
  const indus = suppliers.find((s) => s.code === "SUP-001")!;
  const lucky = suppliers.find((s) => s.code === "SUP-008")!;
  const shahi = suppliers.find((s) => s.code === "SUP-005")!;
  const pByName = (n: string) => products.find((p) => p.name === n)!;

  // Scenario 3: Khan Brothers bounced cheques (2 within 120 days) – receipts that bounced, original invoices remain open
  const khanOpen = invoices.filter((i) => i.customerId === khan.id && i.paymentStatus !== "paid").sort((a, b) => a.date.localeCompare(b.date));
  [addDays(today, -96), addDays(today, -71)].forEach((bd, k) => {
    const inv = khanOpen[k] ?? invoices.filter((i) => i.customerId === khan.id).slice(-1 - k)[0]!;
    const amt = Math.round(Math.min(inv.total, 420_000 + k * 120_000) / 100) * 100;
    payments.push({ id: `pay_${++payN}`, number: `RCP-${payN}`, customerId: khan.id, date: bd, method: "cheque", amount: amt, status: "bounced", chequeNo: digits(6), bank: "HBL", allocations: [] });
    je(bd, `Cheque received – ${khan.name}`, `Receipt RCP-${payN}`, [{ account: "1210", debit: amt, credit: 0 }, { account: "1200", debit: 0, credit: amt }]);
    je(addDays(bd, 3), `Cheque bounced – ${khan.name}`, `Receipt RCP-${payN}`, [{ account: "1200", debit: amt, credit: 0 }, { account: "1210", debit: 0, credit: amt }]);
  });

  // Scenario 2: Indus Beverages bill with price variance (+6.9%) on 3 SKUs
  const iPO = ["NestFresh Mineral Water 500ml", "NestFresh Mineral Water 1L", "Fizzup Cola 1.5L"].map(pByName);
  const targetPO = 1_720_000;
  const baseVals = iPO.map((p) => p.cost * priceFactor(addDays(today, -9)) * supInc(p, today) * p.cartonSize * 60 * (p.name.includes("500ml") ? 2 : 1));
  const scaleF = targetPO / baseVals.reduce((a, b) => a + b, 0);
  const iLines = iPO.map((p, k) => {
    const cartons = Math.max(10, Math.round((baseVals[k]! * scaleF) / (p.cost * priceFactor(today) * supInc(p, today) * p.cartonSize)));
    return { productId: p.id, qty: cartons * p.cartonSize, price: r2(p.cost * priceFactor(today) * supInc(p, today)), received: cartons * p.cartonSize };
  });
  const iSub = r2(iLines.reduce((s, l) => s + l.qty * l.price, 0));
  const iDate = addDays(today, -9);
  const indusPO: PurchaseOrder = { id: `po_${++poN}`, number: `PO-${poN}`, supplierId: indus.id, warehouseId: "wh_KHI-DC1", date: addDays(today, -19), expectedDate: addDays(today, -10), status: "received", lines: iLines, subtotal: iSub, tax: r2(iSub * 0.17), total: r2(iSub * 1.17), source: "user" };
  pos.push(indusPO);
  const iGrn: GoodsReceipt = { id: `grn_${++grnN}`, number: `GRN-${grnN}`, poId: indusPO.id, supplierId: indus.id, warehouseId: "wh_KHI-DC1", date: addDays(today, -10), lines: iLines.map((l) => ({ productId: l.productId, qty: l.qty, batch: `B${today.slice(2, 4)}${today.slice(5, 7)}-${l.productId.slice(-3)}`, expiry: addDays(today, 200) })), value: iSub };
  grns.push(iGrn);
  for (const l of iLines) { const c = cellOf(l.productId, "wh_KHI-DC1"); c.on += l.qty; c.val = r2(c.val + l.qty * l.price); }
  je(iGrn.date, `Goods receipt ${iGrn.number} – ${indusPO.number}`, `GRN ${iGrn.number}`, [{ account: "1300", debit: iSub, credit: 0 }, { account: "2020", debit: 0, credit: iSub }]);
  const bumped = iLines.map((l) => ({ productId: l.productId, description: products[prodIdx.get(l.productId)!]!.name, qty: l.qty, price: r2(l.price * 1.0698), total: r2(l.qty * r2(l.price * 1.0698)) }));
  const exceptions: MatchException[] = [];
  bumped.forEach((bl, k) => {
    const l = iLines[k]!;
    exceptions.push({ type: "PRICE_VARIANCE", productId: bl.productId, expected: l.price, actual: bl.price, variance: r2((bl.price - l.price) * l.qty), note: `Billed ${((bl.price / l.price - 1) * 100).toFixed(1)}% above PO price` });
  });
  exceptions.push({ type: "PRICE_INCREASE_VS_HISTORY", expected: 0, actual: 0, variance: 0, note: "All 3 lines exceed the 90-day median price for this supplier by more than 5%" });
  const indusBill = postBill(indusPO, iGrn, iDate, indus.id, bumped, { status: "exception", exceptions, source: "ai_extraction", invNo: "IB-48217" });

  // Scenario 4: duplicate Lucky Foods bills
  const lp = ["Lucky Crunch Zeera Biscuits Ticky Pack", "Lucky Crunch Cream Sandwich Ticky Pack", "Lucky Crunch Butter Cookies Half Roll"].map(pByName);
  const luckyLines = (scale: number) => lp.map((p, k) => { const cartons = [30, 24, 18][k]! * scale; const price = r2(p.cost * priceFactor(today)); return { productId: p.id, description: p.name, qty: cartons * p.cartonSize, price, total: r2(cartons * p.cartonSize * price) }; });
  const lb1 = postBill(null, null, addDays(today, -12), lucky.id, luckyLines(1), { invNo: "LF-23817", status: "posted" });
  const lb2 = postBill(null, null, addDays(today, -9), lucky.id, luckyLines(1), { invNo: "LF-23B17", status: "pending_match", source: "ai_extraction" });
  lb2.exceptions = [{ type: "DUPLICATE_BILL", expected: lb1.total, actual: lb2.total, variance: lb2.total, note: `Invoice no. LF-23B17 is 1 character from LF-23817; same total, 3 days apart` }];
  lb2.status = "exception";
  for (const b of [lb1]) je(b.date, `Supplier bill ${b.supplierInvoiceNo} (non-PO)`, `Bill ${b.number}`, [{ account: "1300", debit: b.subtotal, credit: 0 }, { account: "1400", debit: b.tax, credit: 0 }, { account: "1410", debit: b.wht236g, credit: 0 }, { account: "2010", debit: 0, credit: b.total }]);
  for (const l of lb1.lines) { const c = cellOf(l.productId!, "wh_LHE-DC"); c.on += l.qty; c.val = r2(c.val + l.total); }
  // JE for lb1 must also hit stock; stock adjustment above matches debit 1300 = subtotal

  // Scenario 5: cash pressure – big Sunridge bill + owner drawings
  const sLines = [{ productId: pByName("Sunridge Cooking Oil 5L").id, qty: 4 * 1800, price: r2(pByName("Sunridge Cooking Oil 5L").cost * priceFactor(today)), received: 0 }, { productId: pByName("Sunridge Banaspati Ghee 1kg").id, qty: 16 * 1500, price: r2(pByName("Sunridge Banaspati Ghee 1kg").cost * priceFactor(today)), received: 0 }];
  const sSub = r2(sLines.reduce((s, l) => s + l.qty * l.price, 0));
  const sunBillDate = addDays(today, -11);
  const sunBill: SupplierBill = {
    id: `bill_${++billN}`, number: `SB-${billN}`, supplierInvoiceNo: "SE-77019", supplierId: sunridge.id, poId: null, date: sunBillDate, dueDate: addDays(sunBillDate, 30),
    lines: sLines.map((l) => ({ productId: l.productId, description: products[prodIdx.get(l.productId)!]!.name, qty: l.qty, price: l.price, total: r2(l.qty * l.price) })), subtotal: sSub, tax: 0, wht236g: 0, total: 0, paid: 0, status: "posted", exceptions: [], source: "manual",
  };
  const sunTarget = 7_800_000;
  const sf = sunTarget / sSub;
  sunBill.lines = sunBill.lines.map((l) => { const q = Math.round((l.qty * sf) / 4) * 4; return { ...l, qty: q, total: r2(q * l.price) }; });
  sunBill.subtotal = r2(sunBill.lines.reduce((s, l) => s + l.total, 0));
  sunBill.tax = r2(sunBill.subtotal * 0.17); sunBill.wht236g = r2((sunBill.subtotal + sunBill.tax) * 0.001); sunBill.total = r2(sunBill.subtotal + sunBill.tax + sunBill.wht236g);
  bills.push(sunBill);
  for (const l of sunBill.lines) { const c = cellOf(l.productId!, "wh_KHI-DC1"); c.on += l.qty; c.val = r2(c.val + l.total); }
  je(sunBillDate, `Supplier bill ${sunBill.supplierInvoiceNo} (direct)`, `Bill ${sunBill.number}`, [{ account: "1300", debit: sunBill.subtotal, credit: 0 }, { account: "1400", debit: sunBill.tax, credit: 0 }, { account: "1410", debit: sunBill.wht236g, credit: 0 }, { account: "2010", debit: 0, credit: sunBill.total }]);

  // clear scheduled payment for open bills in the future (keep unpaid)
  for (const b of bills) if (b.status === "paid" && !supplierPayments.some((p) => p.billIds.includes(b.id))) { b.paid = 0; b.status = "posted"; }

  // Scenario 7: LHE Personal Care aisle C discrepancy – negative variances in 4 of last 6 cycle counts
  const lhePC = products.filter((p) => p.category === "personal_care" && p.price > 300).slice(0, 5);
  const counter = "Waqas Ahmed";
  let cn = 0;
  for (let k = 5; k >= 0; k--) {
    const date = addDays(today, -k * 13 - 4);
    const bad = k !== 1 && k !== 4;
    const lines = lhePC.slice(0, 3).map((p) => {
      const c = cellOf(p.id, "wh_LHE-DC");
      const expected = Math.max(0, c.on);
      const short = bad ? Math.max(12, Math.round(expected * (0.015 + rr() * 0.03))) : 0;
      const loss = Math.min(short, c.on);
      if (loss > 0) { const v = r2((c.val * loss) / Math.max(1, c.on)); c.on -= loss; c.val = r2(c.val - v); je(date, `Count variance LHE-DC C-${ri(1, 9)} – ${p.name}`, `Count SC-${300 + cn}`, [{ account: "5020", debit: v, credit: 0 }, { account: "1300", debit: 0, credit: v }]); }
      return { productId: p.id, location: `C-${ri(1, 9)}-0${ri(1, 4)}`, expected, counted: expected - loss };
    });
    stockCounts.push({ id: `sc_${++cn}`, number: `SC-${300 + cn}`, warehouseId: "wh_LHE-DC", date, counter, status: "posted", lines });
  }
  for (let k = 0; k < 14; k++) {
    const w = pick(warehouses.slice(0, 5));
    const date = addDays(today, -ri(5, 140));
    const ps = Array.from({ length: 3 }, () => pick(products));
    stockCounts.push({ id: `sc_${++cn}`, number: `SC-${300 + cn}`, warehouseId: w.id, date, counter: pick(employees.filter((e) => e.department === "Warehouse & Logistics")).name, status: "posted", lines: ps.map((p) => { const e = Math.max(0, cellOf(p.id, w.id).on); const diff = pick([0, 0, 0, -1, 1, -2]) * Math.round(p.cartonSize / 12 || 1); return { productId: p.id, location: `${pick(["A", "B", "D", "E"])}-${ri(1, 9)}-0${ri(1, 4)}`, expected: e, counted: Math.max(0, e + diff) }; }) });
  }
  stockCounts.sort((a, b) => b.date.localeCompare(a.date));

  // Owner drawings calibrate cash so the demo shows pressure (scenario 5)
  const bankAccts = ["1100", "1110", "1120", "1130", "1010"];
  const balOf = (codes: string[]) => journal.reduce((s, j) => s + j.lines.filter((l) => codes.includes(l.account)).reduce((x, l) => x + l.debit - l.credit, 0), 0);
  const cashNow = balOf(bankAccts);
  const targetCash = 34_000_000;
  if (cashNow > targetCash) {
    const draw = Math.round((cashNow - targetCash) / 1000) * 1000;
    je(addDays(today, -3), "Director's drawings (owner withdrawal)", "Manual journal", [{ account: "3020", debit: draw, credit: 0 }, { account: "1100", debit: 0, credit: draw }], "manual", "Ayesha Siddiqui");
  }
  // Inter-bank sweep: the day-to-day flows above hit accounts unevenly, so rebalance each account to a sensible share of total cash.
  {
    const accts = ["1100", "1110", "1120", "1130"];
    const bals = accts.map((a) => balOf([a]));
    const total = bals.reduce((x, y) => x + y, 0);
    const shares = [0.4, 0.25, 0.2, 0.15];
    const sweep = accts.map((a, i) => ({ account: a, diff: total * shares[i]! - bals[i]! })).filter((x) => Math.abs(x.diff) > 1);
    const rounded = sweep.map((x) => ({ ...x, diff: Math.round(x.diff) }));
    const drift = rounded.reduce((y, x) => y + x.diff, 0);
    if (rounded.length) { rounded[0]!.diff -= drift; je(addDays(today, -4), "Inter-bank funds transfer (balance accounts)", "Manual journal", rounded.map((x) => ({ account: x.account, debit: Math.max(x.diff, 0), credit: Math.max(-x.diff, 0) })), "manual", "Ayesha Siddiqui"); }
  }
  // Journal anomaly: Rs 499,000 manual JE on a Sunday late night
  let sunday = addDays(today, -9); while (weekday(sunday) !== 0) sunday = addDays(sunday, -1);
  je(sunday, "Misc. adjustment – consultancy (Sunday 23:10)", "Manual journal", [{ account: "6990", debit: 499_000, credit: 0 }, { account: "1100", debit: 0, credit: 499_000 }], "manual", "Kashif Raza");
  // year-end closing entry for FY25-26
  const closeDate = "2026-06-30";
  const closeLines: JournalLine[] = [];
  const net = new Map<string, number>();
  for (const j of journal) if (j.date <= closeDate) for (const l of j.lines) { const a = ACCOUNTS.find((x) => x.code === l.account)!; if (a.type === "income" || a.type === "expense") net.set(a.code, (net.get(a.code) ?? 0) + l.debit - l.credit); }
  let tot = 0;
  for (const [code, v] of net) { if (Math.abs(v) < 0.005) continue; closeLines.push({ account: code, debit: v < 0 ? -v : 0, credit: v > 0 ? v : 0 }); tot += v; }
  closeLines.push({ account: "3100", debit: tot > 0 ? 0 : -tot, credit: tot > 0 ? 0 : 0 });
  closeLines[closeLines.length - 1] = tot > 0 ? { account: "3100", debit: r2(tot), credit: 0 } : { account: "3100", debit: 0, credit: r2(-tot) };
  je(closeDate, "FY25-26 year-end closing entry", "Year-end close", closeLines, "closing", "Ayesha Siddiqui");
  journal.sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  journal.forEach((j, i) => { j.number = `JE-${pad(i + 1, 6)}`; });

  // ───────── POs pending / recent ─────────
  const fsd = "wh_KHI-DC1";
  const bigPO: PurchaseOrder = { id: `po_${++poN}`, number: `PO-${poN}`, supplierId: indus.id, warehouseId: fsd, date: addDays(today, -1), expectedDate: addDays(today, 8), status: "pending_approval", lines: [], subtotal: 0, tax: 0, total: 0, source: "user" };
  for (const p of ["NestFresh Mineral Water 1L", "NestFresh Mineral Water 500ml", "Fizzup Cola 345ml", "Juicy Valley Mango Nectar 200ml"].map(pByName)) {
    const q = Math.round(220_000 / (p.cost * priceFactor(today) * p.cartonSize)) * p.cartonSize * (p.name.includes("200ml") ? 1 : 1);
    bigPO.lines.push({ productId: p.id, qty: q, price: r2(p.cost * priceFactor(today) * supInc(p, today)), received: 0 });
  }
  bigPO.subtotal = r2(bigPO.lines.reduce((s, l) => s + l.qty * l.price, 0));
  const scalePO = 1_540_000 / bigPO.subtotal;
  bigPO.lines.forEach((l) => { const cs = products[prodIdx.get(l.productId)!]!.cartonSize; l.qty = Math.max(cs, Math.round((l.qty * scalePO) / cs) * cs); });
  bigPO.subtotal = r2(bigPO.lines.reduce((s, l) => s + l.qty * l.price, 0)); bigPO.tax = r2(bigPO.subtotal * 0.17); bigPO.total = r2(bigPO.subtotal + bigPO.tax);
  pos.push(bigPO);
  const draftPO: PurchaseOrder = { id: `po_${++poN}`, number: `PO-${poN}`, supplierId: shahi.id, warehouseId: "wh_LHE-DC", date: today, expectedDate: addDays(today, 9), status: "draft", lines: ["Shahi Biryani Masala 50g", "Shahi Chicken Noodles 65g"].map((n) => { const p = pByName(n); return { productId: p.id, qty: p.cartonSize * 40, price: r2(p.cost * priceFactor(today)), received: 0 }; }), subtotal: 0, tax: 0, total: 0, source: "user" };
  draftPO.subtotal = r2(draftPO.lines.reduce((s, l) => s + l.qty * l.price, 0)); draftPO.tax = r2(draftPO.subtotal * 0.17); draftPO.total = r2(draftPO.subtotal + draftPO.tax);
  pos.push(draftPO);
  pos.sort((a, b) => b.date.localeCompare(a.date));
  for (const l of bigPO.lines) cellOf(l.productId, fsd).incoming += 0; // pending PO not yet "incoming"

  // approvals PO status for historical: partially received flagged by receipts
  // ───────── quotes, leads, expenses, leave ─────────
  const quotes: Quote[] = [];
  for (let i = 0; i < 46; i++) {
    const c = pick(customers), d = addDays(today, -ri(1, 75)), st = d > addDays(today, -6) ? pick(["draft", "sent"] as const) : pick(["sent", "accepted", "accepted", "rejected", "expired"] as const);
    const lines: DocLine[] = Array.from({ length: ri(3, 8) }, () => { const p = pick(products); const q = p.cartonSize * ri(2, 20); const price = r2(p.price * 0.97); return { productId: p.id, qty: q, price, discount: 0, value: r2(q * price), salesTax: 0 }; });
    quotes.push({ id: `q_${i + 1}`, number: `QT-${6000 + i}`, customerId: c.id, repId: c.repId, date: d, validUntil: addDays(d, 14), status: st === "sent" && addDays(d, 14) < today ? "expired" : st, lines, total: r2(lines.reduce((s, l) => s + l.value, 0)) });
  }
  quotes.sort((a, b) => b.date.localeCompare(a.date));

  const leadNames = ["Zaitoon Foods Mart", "Bin Qasim Trading", "Fatima General Store", "Gulberg Hyper Market", "Allama Iqbal Traders", "Orangi Wholesale Hub", "Skardu Mountain Mart", "Peshawar Frontier Traders", "Quetta Bolan Wholesale", "Garden Town Superstore", "Defence Fresh Bazaar", "Murree Road Kiryana", "Saeed Brothers", "Taj Bakers & Grocers", "Wah Cantt Mart", "Kasur Sub-Distribution", "Gujrat Trade Center", "Jhang Road Wholesale", "Sargodha Foods Hub", "Mardan Retail Group"];
  const stages: Lead["stage"][] = ["new", "qualified", "proposal", "negotiation", "won", "lost"];
  const leads: Lead[] = leadNames.map((n, i) => ({ id: `lead_${i + 1}`, company: n, contact: `${pick(FIRST_NAMES_M)} ${pick(LAST_NAMES)}`, city: pick(["Karachi", "Lahore", "Peshawar", "Quetta", "Rawalpindi", "Gujranwala", "Mardan", "Sargodha"]), source: pick(["Referral", "Walk-in", "Field visit", "WhatsApp inquiry", "Trade expo"]), repId: pick(reps).id, value: ri(4, 60) * 100_000, probability: [10, 25, 50, 70, 100, 0][i % 6]!, stage: stages[i % 6]! }));

  const expMerchants: [string, string, number][] = [["Fuel", "Petro Plus Fuel Station", 6500], ["Fuel", "Highway Fuel Point", 9000], ["Travel", "Daewoo-style Express Bus", 4200], ["Meals", "Café Lahori Tikka", 3600], ["Office", "Stationery Corner", 5200], ["Repairs", "Karachi Auto Works", 18500], ["Telephone", "Mobile Top-up Shop", 2000], ["Travel", "Careem-style Ride", 1800], ["Entertainment", "Client Dinner – Kolachi Grill", 14500]];
  const eStatuses: Expense["status"][] = ["reimbursed", "reimbursed", "reimbursed", "finance_approved", "manager_approved", "rejected"];
  for (let i = 0; i < 110; i++) {
    const m = pick(expMerchants), e = pick(employees.filter((x) => x.department === "Sales" || x.department === "Warehouse & Logistics" || x.department === "Procurement"));
    const date = addDays(today, -ri(0, 180));
    const amt = Math.round(m[2] * (0.6 + rr() * 1.2) / 50) * 50;
    const st = date > addDays(today, -6) ? pick(["submitted", "manager_approved"] as const) : pick(eStatuses);
    expenses.push({ id: `ex_${++exN}`, number: `EXP-${exN}`, employeeId: e.id, category: m[0], merchant: m[1], date, amount: amt, purpose: `${m[0]} – ${pick(["route visit", "client meeting", "stock transfer", "warehouse inspection", "supplier visit"])}`, status: st, flags: amt > 15_000 ? ["Above category limit"] : [] });
  }
  expenses.sort((a, b) => b.date.localeCompare(a.date));
  const exRecent = expenses.find((e) => e.status === "manager_approved")!;
  exRecent.amount = 42_000; exRecent.category = "Repairs"; exRecent.merchant = "Karachi Auto Works"; exRecent.purpose = "Repairs – delivery van brake overhaul"; exRecent.flags = ["Above category limit", "No receipt attached"]; exRecent.employeeId = whKhi.id;
  const dupEx = expenses.find((e) => e.status === "submitted") ?? expenses[1]!;
  dupEx.flags = ["Possible duplicate of EXP-" + (exN - 12)];

  const leaves: LeaveRequest[] = Array.from({ length: 18 }, (_, i) => { const e = pick(employees), f = addDays(today, ri(-60, 40)), days = ri(1, 5); return { id: `lv_${i + 1}`, employeeId: e.id, type: pick(["Annual", "Sick", "Casual"] as const), from: f, to: addDays(f, days - 1), days, status: f > today ? pick(["pending", "pending", "approved"] as const) : pick(["approved", "approved", "rejected"] as const), reason: pick(["Family function", "Medical appointment", "Eid travel", "Personal work", "Out of station"]) }; });

  // ───────── bank statement (MCB collection, last 40 days) ─────────
  const bank: BankTxn[] = [];
  const bankPays = payments.filter((p) => p.method === "bank_transfer" && p.date > addDays(today, -40) && p.date <= today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 38);
  bankPays.forEach((p, i) => {
    const c = customers.find((x) => x.id === p.customerId)!;
    const narr = `IBFT FRM ${c.name.toUpperCase().replace(/[^A-Z ]/g, "").slice(0, 18)} ${c.city.slice(0, 3).toUpperCase()}`;
    const t: BankTxn = { id: `bt_${i + 1}`, date: p.date, description: narr, amount: p.amount, status: "matched" };
    if (i % 7 === 3) { t.status = "suggested"; t.suggestion = { label: `${p.number} · ${c.name}`, confidence: 0.78 + rr() * 0.2, method: i % 2 ? "ai" : "score" }; }
    bank.push(t);
  });
  bank.push({ id: "bt_u1", date: addDays(today, -2), description: "CHQ DEP 889231 CLG", amount: 612_500, status: "unmatched" }, { id: "bt_u2", date: addDays(today, -4), description: "IBFT FRM A NOOR SUPR STR KHI", amount: 540_000, status: "suggested", suggestion: { label: `Payment · ${alNoor.name} (2 invoices)`, confidence: 0.91, method: "ai" } }, { id: "bt_u3", date: addDays(today, -6), description: "CASH DEP BRANCH LHR", amount: 285_000, status: "unmatched" }, { id: "bt_u4", date: addDays(today, -1), description: "SERVICE CHARGES", amount: -4_500, status: "unmatched" });
  bank.sort((a, b) => b.date.localeCompare(a.date));

  // ───────── approvals, audit, notifications ─────────
  const approvals: Approval[] = [];
  const ap = (a: Omit<Approval, "id" | "status">) => approvals.push({ id: `apr_${approvals.length + 1}`, status: "pending", ...a });
  ap({ type: "purchase_order", title: `Purchase order ${bigPO.number} – ${indus.name}`, subtitle: `${bigPO.lines.length} lines · expected ${bigPO.expectedDate}`, amount: bigPO.total, requestedBy: proc.name, requestedAt: addDays(today, -1), ref: bigPO.id, source: "user", step: "Owner" });
  ap({ type: "expense", title: `Expense ${exRecent.number} – vehicle repairs`, subtitle: `${whKhi.name} · no receipt attached`, amount: 42_000, requestedBy: whKhi.name, requestedAt: addDays(today, -2), ref: exRecent.id, source: "user", step: "Finance Manager" });
  ap({ type: "ai_recommendation", title: "Replenish NestFresh Mineral Water 1L – Karachi DC", subtitle: "AI recommendation · forecast stockout before supplier lead time", amount: null, requestedBy: "AI Assistant", requestedAt: today, ref: "rec_nestfresh", source: "ai", step: "Procurement Manager" });
  ap({ type: "bill_variance", title: `Supplier bill ${indusBill.supplierInvoiceNo} – price variance`, subtitle: `${indus.name} · 3 lines above PO price`, amount: indusBill.total, requestedBy: "Three-way match", requestedAt: addDays(today, -4), ref: indusBill.id, source: "ai", step: "Finance Manager" });
  ap({ type: "credit_limit", title: `Credit limit increase – ${prime.name}`, subtitle: "Rs 4,000,000 → Rs 6,000,000 requested by sales", amount: 6_000_000, requestedBy: employees.find((e) => e.id === prime.repId)!.name, requestedAt: addDays(today, -3), ref: prime.id, source: "user", step: "Owner" });
  ap({ type: "credit_override", title: `Credit override – ${khan.name}`, subtitle: "Draft order exceeds limit; 2 bounced cheques on file", amount: 640_000, requestedBy: employees.find((e) => e.id === khan.repId)!.name, requestedAt: addDays(today, -1), ref: "so_khan", source: "user", step: "Sales Manager" });
  for (const l of leaves.filter((x) => x.status === "pending")) { const e = employees.find((x) => x.id === l.employeeId)!; ap({ type: "leave", title: `Leave request – ${e.name}`, subtitle: `${l.type} · ${l.days} day${l.days > 1 ? "s" : ""}`, amount: null, requestedBy: e.name, requestedAt: addDays(today, -2), ref: l.id, source: "user", step: "Line manager" }); }

  const audit: AuditEvent[] = [];
  const au = (h: number, m: number, actor: string, action: string, entity: string, ref: string, source: AuditEvent["source"], detail?: string, daysAgo = 0) => audit.push({ id: `au_${audit.length + 1}`, at: `${addDays(today, -daysAgo)}T${pad(h, 2)}:${pad(m, 2)}:00+05:00`, actor, action, entity, ref, source, detail });
  au(9, 42, "Hina Rauf", "purchase_order.submitted", "Purchase order", bigPO.number, "user", `Submitted for approval · ${bigPO.lines.length} lines`, 1);
  au(9, 5, "Ayesha Siddiqui", "supplier_bill.coding_approved", "Supplier bill", "SB-" + (billN - 2), "ai_proposal", "Approved AI-generated supplier invoice coding", 2);
  au(18, 20, "System", "invoice.fbr_submitted", "Invoice", invoices[invoices.length - 1]!.number, "system", "FBR simulated · IRN issued", 1);
  au(17, 48, "Usman Ghani", "sales_order.confirmed", "Sales order", orders[orders.length - 1]!.number, "user", "Stock reserved · credit check passed", 1);
  au(16, 2, "Imran Qureshi", "stock_count.posted", "Stock count", stockCounts[0]!.number, "user", "Variance −Rs 61,400 posted", 2);
  au(15, 31, "Bilal Ahmed", "customer.credit_override_requested", "Customer", khan.code, "user", "Override requested for draft order", 1);
  au(11, 12, "System", "workflow.create_ai_recommendation", "Workflow", "WF-002", "workflow", "Available < reorder point · NestFresh Mineral Water 1L @ KHI-DC1", 0);
  au(10, 3, "Kashif Raza", "journal_entry.posted", "Journal entry", "JE manual", "user", "Manual JE Rs 499,000 to 6990 Miscellaneous", 8);
  au(9, 18, "Tariq Mehmood", "approval.approved", "Purchase order", `PO-${poN - 4}`, "user", "Approved (Owner step)", 3);
  au(8, 44, "System", "cheque.bounced", "Payment", payments.find((p) => p.status === "bounced")?.number ?? "RCP", "system", "Cheque returned unpaid · credit risk recomputed", 5);
  au(14, 22, "Ayesha Siddiqui", "bank_reconciliation.matched", "Bank transaction", "bt_3", "ai_proposal", "Confirmed AI-suggested match (score)", 2);
  au(12, 0, "Zainab Hussain", "integration.mode_changed", "Integration", "FBR Digital Invoicing", "user", "Mode set to Simulated", 6);

  const notifications: Notification[] = [
    { id: "n1", at: `${today}T11:12:00+05:00`, title: "Low stock: NestFresh Mineral Water 1L", body: "KHI-DC1 will run out before the next supplier delivery can arrive.", severity: "danger", href: "/inventory/replenishment", read: false },
    { id: "n2", at: `${today}T09:30:00+05:00`, title: "5 approvals waiting", body: "Purchase order Rs 1.8M, expense, AI recommendation, supplier bill variance, credit limit.", severity: "warning", href: "/approvals", read: false },
    { id: "n3", at: `${addDays(today, -1)}T18:05:00+05:00`, title: "Supplier bill needs review", body: `${indus.name} bill ${indusBill.supplierInvoiceNo}: 3 lines priced above PO.`, severity: "warning", href: "/purchasing/bills", read: false },
    { id: "n4", at: `${addDays(today, -1)}T14:00:00+05:00`, title: "Possible duplicate bill detected", body: "LF-23B17 looks like LF-23817 from Lucky Foods.", severity: "danger", href: "/purchasing/bills", read: false },
    { id: "n5", at: `${addDays(today, -2)}T10:15:00+05:00`, title: "Cash-flow warning", body: "Projected bank balance falls below the Rs 5M minimum in week 3.", severity: "danger", href: "/finance/cashflow", read: true },
    { id: "n6", at: `${addDays(today, -3)}T16:40:00+05:00`, title: "Payment overdue: Khan Brothers Traders", body: "Oldest invoice is 60+ days past due.", severity: "warning", href: `/customers/${khan.id}`, read: true },
    { id: "n7", at: `${addDays(today, -4)}T12:10:00+05:00`, title: "Stock count discrepancy", body: "Lahore DC Personal Care aisle C has repeated shortages.", severity: "warning", href: "/warehouses", read: true },
    { id: "n8", at: `${addDays(today, -5)}T09:00:00+05:00`, title: "Purchase order approved", body: `PO-${poN - 4} approved by Tariq Mehmood.`, severity: "success", href: "/purchasing/orders", read: true },
  ];

  // stock vs credit limit autoscale (keep Khan over limit by design)
  for (const c of customers) {
    if (c.id === khan.id) continue;
    const out = invoices.filter((i) => i.customerId === c.id).reduce((s, i) => s + (i.total - i.paid), 0);
    if (out > c.creditLimit * 0.82) c.creditLimit = Math.ceil((out * 1.28) / 100_000) * 100_000;
  }
  prime.creditLimit = 4_000_000;
  const primeOut = invoices.filter((i) => i.customerId === prime.id).reduce((s, i) => s + (i.total - i.paid), 0);
  if (primeOut > 3_400_000) prime.creditLimit = Math.ceil((primeOut * 1.15) / 100_000) * 100_000;
  khan.status = "active";

  // Khan draft order awaiting credit override
  const khanLines: DocLine[] = ["Shahi Chicken Noodles 65g", "Lucky Crunch Zeera Biscuits Ticky Pack", "Zara Beauty Soap 130g"].map((n, k) => { const p = pByName(n); const q = p.cartonSize * [20, 12, 10][k]!; const v = r2(q * p.price * 0.985); return { productId: p.id, qty: q, price: r2(p.price * 0.985), discount: 0, value: v, salesTax: r2(0.18 * p.mrp * q) }; });
  const khanOut = invoices.filter((i) => i.customerId === khan.id).reduce((s, i) => s + (i.total - i.paid), 0);
  const kSub = r2(khanLines.reduce((s, l) => s + l.value, 0)), kTax = r2(khanLines.reduce((s, l) => s + l.salesTax, 0));
  orders.push({
    id: "so_khan", number: `SO-${++soN}`, customerId: khan.id, repId: khan.repId, warehouseId: khan.warehouseId, date: today, status: "draft", lines: khanLines, subtotal: kSub, discount: 0, tax: kTax, total: r2(kSub + kTax), invoiceId: null, source: "user",
    creditCheck: { decision: "block", exposure: r2(khanOut + kSub + kTax), limit: khan.creditLimit, overdueDays: Math.max(0, ...invoices.filter((i) => i.customerId === khan.id && i.paid < i.total).map((i) => diffDays(today, i.dueDate))), reasons: ["Exposure exceeds credit limit", "Invoice overdue beyond 30 days past terms", "2 cheques bounced in the last 120 days"] },
  });
  ap({ type: "stock_adjustment", title: "Stock count variance – Lahore DC (Personal Care, aisle C)", subtitle: "Count SC-" + (300 + 6) + " · −Rs 61,400", amount: 61_400, requestedBy: "Waqas Ahmed", requestedAt: addDays(today, -4), ref: stockCounts[0]!.id, source: "user", step: "Finance Manager" });
  approvals[approvals.length - 1]!.status = "approved";

  orders.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  invoices.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  payments.sort((a, b) => b.date.localeCompare(a.date));
  grns.sort((a, b) => b.date.localeCompare(a.date));
  bills.sort((a, b) => b.date.localeCompare(a.date));
  supplierPayments.sort((a, b) => b.date.localeCompare(a.date));
  payroll.sort((a, b) => b.month.localeCompare(a.month));

  return {
    today, start, warehouses, suppliers, products, customers, employees, quotes, orders, invoices, creditNotes, payments, pos, grns, bills, supplierPayments, stockCounts, expenses, leaves, payroll,
    shipments: [], transfers: [], claims: [], outbox: [], periodStatus: {},
    settings: { poOwnerLimit: 1_000_000, adjustApprovalLimit: 50_000, jeApprovalLimit: 500_000, expenseFinanceLimit: 25_000, maxOverdueDays: 30, minCash: ORG.minCash, furtherTaxRate: 0.04, wht236hAtl: 0.005, wht236hNonAtlRetail: 0.025, wht236hNonAtlOther: 0.01 },
    rules: [
      { id: "WF-001", name: "Large invoice approval", event: "invoice.posted", fact: "invoice.total", op: "gt", value: 500_000, action: "notify", target: "finance", enabled: true, runs: 41 },
      { id: "WF-002", name: "Low stock recommendation", event: "stock.low", fact: "available", op: "any", value: 0, action: "create_recommendation", target: "procurement", enabled: true, runs: 128 },
      { id: "WF-003", name: "Bounced cheque follow-up", event: "payment.bounced", fact: "payment.amount", op: "any", value: 0, action: "create_task", target: "sales_manager", enabled: true, runs: 9 },
    ],
    accounts: ACCOUNTS, journal, bank, approvals, audit, notifications, leads, stock, calendar, bankBalanceAccounts: bankAccts,
    scenario: { khanId: khan.id, alNoorId: alNoor.id, cityId: cityCC.id, indusBillId: indusBill.id, dupBillId: lb2.id, lowStock: [...skipKey], lhePcLocation: "C" },
  };
}

let base: DB | null = null;
let resolver: (() => DB | undefined) | null = null;
/** Server routes register a resolver so getDB() returns the request's own world (base + replayed commands). */
export function setWorldResolver(fn: () => DB | undefined) { resolver = fn; }
let override: DB | null = null;
/** Run synchronous code with getDB() pinned to `db` (used by the command engine). */
export function runOn<T>(db: DB, fn: () => T): T { const prev = override; override = db; try { return fn(); } finally { override = prev; } }
export function getDB(): DB {
  if (override) return override;
  const w = resolver?.();
  if (w) return w;
  if (!base || base.today !== todayPK()) base = buildDB();
  return base;
}
void ORG; void endOfMonth; void startOfMonth;
