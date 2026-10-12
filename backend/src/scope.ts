// Record-level rules the permission table cannot express: a rep only touches their own customers and leads, and leave and
// expense requests are always filed for the signed-in person. Evaluated against the live state before a command runs.
import { COMMAND_PERMISSIONS, can, type CommandType, type DB, type Role } from "./engine";

export interface Caller { name: string; role: Role; emp: string }
type Fail = { ok: false; code: string; title: string; detail: string };
type Pass = { ok: true; payload: Record<string, unknown> };
const no = (code: string, title: string, detail: string): Fail => ({ ok: false, code, title, detail });

export function enforceScope(db: DB, who: Caller, type: CommandType, raw: unknown): Pass | Fail {
  const payload = { ...((raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>) };
  const scope = COMMAND_PERMISSIONS[type].scope;
  const me = db.employees.find((e) => e.name === who.emp);

  if (scope === "self") {
    if (can(who.role, "hr.manage")) return { ok: true, payload };
    if (!me) return no("NO_EMPLOYEE", "Your account isn't linked to an employee record", "Ask HR to add you under Employees, then try again.");
    payload.employeeId = me.id; // whatever the request said, it is filed for the signed-in person
    return { ok: true, payload };
  }

  if (who.role !== "rep") {
    if (type === "RequestCreditLimit") payload.requestedBy = who.name;
    return { ok: true, payload };
  }
  if (!me) return no("NO_EMPLOYEE", "Your account isn't linked to an employee record", "Ask the Owner to add you under Employees, then try again.");

  if (scope === "own-lead") {
    if (type === "CreateLead") { payload.repId = me.id; return { ok: true, payload }; }
    const lead = db.leads.find((l) => l.id === payload.id);
    return lead && lead.repId !== me.id ? no("SCOPE", "This lead isn't yours", "Order bookers can only work their own leads.") : { ok: true, payload };
  }

  if (scope === "own-cust") {
    const customerId = (payload.customerId as string | undefined)
      ?? db.orders.find((o) => o.id === payload.orderId)?.customerId
      ?? db.quotes.find((q) => q.id === payload.id)?.customerId;
    const c = db.customers.find((x) => x.id === customerId);
    if (c && c.repId !== me.id) return no("SCOPE", "This customer isn't yours", "Order bookers can only work with customers assigned to them.");
    if (type === "RequestCreditLimit") payload.requestedBy = who.name;
  }
  return { ok: true, payload };
}
