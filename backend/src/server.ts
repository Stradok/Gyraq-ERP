import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { hashPassword, issue, throttled, verify, verifyPassword, type Session } from "./auth";
import { config } from "./config";
import { migrate, pool } from "./db";
import { HANDLERS, PERSONAS, can, type Action, type CommandType } from "./engine";
import { boot, commandsSince, mode, submit, world } from "./world";

// Which permission each command needs. The engine also validates its own rules; this is the role boundary the browser UI only hints at.
const NEEDS: Partial<Record<CommandType, Action>> = {
  CreateOrder: "order.create", RecordPayment: "payment.record", CreatePO: "po.create", ReceiveGoods: "po.receive", PickOrder: "warehouse.ops", DispatchOrder: "warehouse.ops", PostCount: "warehouse.ops", TransferStock: "warehouse.ops",
  CreateCustomer: "master.create", CreateSupplier: "master.create", CreateProduct: "master.create", CreateLead: "master.create", AdjustStock: "stock.adjust", CreateBill: "bill.create", PaySupplier: "supplier.pay", CreateReturn: "return.create",
  ClosePeriod: "period.close", ReopenPeriod: "period.close", UpdateSettings: "period.close", CreateEmployee: "hr.manage", UpdateEmployee: "hr.manage", RunPayroll: "hr.manage",
};

type Env = { Variables: { session: Session } };
const app = new Hono<Env>();
app.use("*", cors({ origin: config.corsOrigin.includes("*") ? "*" : config.corsOrigin, allowHeaders: ["authorization", "content-type"] }));

app.get("/health", async (c) => { await pool.query("select 1"); return c.json({ ok: true, anchor: world.today }); });

app.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
  if (!email || !password) return c.json({ error: "Enter your email and password." }, 400);
  if (throttled(`${c.req.header("x-forwarded-for") ?? "local"}|${email.toLowerCase()}`)) return c.json({ error: "Too many attempts. Wait a few minutes." }, 429);
  const u = (await pool.query("select * from users where lower(email)=lower($1) and active", [email])).rows[0];
  if (!u || !verifyPassword(password, u.pw_hash)) return c.json({ error: "Wrong email or password." }, 401);
  const s = { sub: u.id as string, email: u.email as string, name: u.name as string, role: u.role, emp: u.emp_name as string };
  return c.json({ token: issue(s), user: { id: s.sub, email: s.email, name: s.name, title: u.title, role: s.role, emp: s.emp } });
});

const guard = async (c: Context<Env>, next: () => Promise<void>) => {
  const t = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  const s = t ? verify(t) : null;
  if (!s) return c.json({ error: "Sign in again." }, 401);
  // Role and active flag come from the database each time, so a change or deactivation takes effect at once.
  const u = (await pool.query("select role, active from users where id=$1", [s.sub])).rows[0];
  if (!u?.active) return c.json({ error: "This account is disabled." }, 401);
  c.set("session", { ...s, role: u.role }); await next();
};
app.use("/api/*", guard);

app.get("/api/me", (c) => c.json(c.get("session")));

// ── user management (Owner and Admin) ──
const ROLES = ["owner", "admin", "finance", "sales_manager", "rep", "warehouse", "procurement", "employee"];
const isAdmin = (s: Session) => s.role === "owner" || s.role === "admin";
const noAccess = (c: Context<Env>) => c.json({ error: "Only the Owner or Admin can manage users." }, 403);
app.get("/api/users", async (c) => {
  if (!isAdmin(c.get("session"))) return noAccess(c);
  return c.json({ users: (await pool.query("select id,email,name,title,role,emp_name as emp,active,created_at from users order by created_at, email")).rows });
});
app.post("/api/users", async (c) => {
  if (!isAdmin(c.get("session"))) return noAccess(c);
  const b = await c.req.json<{ email?: string; name?: string; title?: string; role?: string; password?: string; emp?: string }>().catch(() => ({} as Record<string, string>));
  const email = (b.email ?? "").trim().toLowerCase(), name = (b.name ?? "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return c.json({ error: "Enter a valid email." }, 400);
  if (name.length < 3) return c.json({ error: "Enter the person's full name." }, 400);
  if (!b.role || !ROLES.includes(b.role)) return c.json({ error: "Pick a role." }, 400);
  if (b.role === "owner" && c.get("session").role !== "owner") return c.json({ error: "Only an Owner can create another Owner." }, 403);
  if ((b.password ?? "").length < 8) return c.json({ error: "Password must be at least 8 characters." }, 400);
  const emp = b.emp || name; // the employee record this person acts as (leave, expenses); may be added later
  if ((await pool.query("select 1 from users where lower(email)=$1", [email])).rowCount) return c.json({ error: "A user with this email already exists." }, 409);
  const r = await pool.query("insert into users(email,name,title,role,emp_name,pw_hash) values ($1,$2,$3,$4,$5,$6) returning id", [email, name, b.title ?? "", b.role, emp, hashPassword(b.password!)]);
  return c.json({ ok: true, id: r.rows[0].id });
});
app.patch("/api/users/:id", async (c) => {
  const s = c.get("session"); if (!isAdmin(s)) return noAccess(c);
  const id = c.req.param("id");
  const b = await c.req.json<{ role?: string; active?: boolean; password?: string; title?: string }>().catch(() => ({} as Record<string, never>));
  const target = (await pool.query("select id, role, active from users where id=$1", [id])).rows[0];
  if (!target) return c.json({ error: "User not found." }, 404);
  if ((target.role === "owner" || b.role === "owner") && s.role !== "owner") return c.json({ error: "Only an Owner can change an Owner." }, 403);
  if (id === s.sub && (b.active === false || (b.role && b.role !== s.role))) return c.json({ error: "You can't disable or change the role of your own account." }, 400);
  if (b.role && !ROLES.includes(b.role)) return c.json({ error: "Unknown role." }, 400);
  if (b.password !== undefined && b.password.length < 8) return c.json({ error: "Password must be at least 8 characters." }, 400);
  const demotes = (target.role === "owner" && ((b.role && b.role !== "owner") || b.active === false));
  if (demotes && (await pool.query("select count(*)::int n from users where role='owner' and active")).rows[0].n < 2) return c.json({ error: "There must always be at least one active Owner." }, 400);
  await pool.query("update users set role=coalesce($2,role), active=coalesce($3,active), title=coalesce($4,title), pw_hash=coalesce($5,pw_hash) where id=$1", [id, b.role ?? null, b.active ?? null, b.title ?? null, b.password ? hashPassword(b.password) : null]);
  return c.json({ ok: true });
});

/** Everything a browser needs to rebuild the shared state: the seed anchor and every command so far. */
app.get("/api/bootstrap", async (c) => c.json({ anchor: world.today, mode, commands: await commandsSince(0), session: c.get("session") }));
app.get("/api/commands", async (c) => c.json({ commands: await commandsSince(Number(c.req.query("since") ?? 0)) }));

app.post("/api/commands", async (c) => {
  const s = c.get("session");
  const b = await c.req.json<{ type?: string; payload?: unknown; source?: "user" | "ai_proposal"; id?: string; at?: string; baseSeq?: number }>().catch(() => ({} as { type?: string; payload?: unknown; source?: "user" | "ai_proposal"; id?: string; at?: string; baseSeq?: number }));
  if (b.id !== undefined && !/^[\w-]{6,64}$/.test(b.id)) return c.json({ ok: false, error: { code: "BAD_ID", title: "Bad command id", detail: "", recovery: "Refresh the page." } }, 400);
  if (!b.type || !(b.type in HANDLERS)) return c.json({ ok: false, error: { code: "CMD_UNKNOWN", title: "Unknown action", detail: `No such command: ${b.type}`, recovery: "Refresh the page." } }, 400);
  const type = b.type as CommandType;
  const need = NEEDS[type];
  if (need && !can(s.role, need)) return c.json({ ok: false, error: { code: "FORBIDDEN", title: "Your role can't do this", detail: `${s.role.replace("_", " ")} is not allowed to ${type}.`, recovery: "Ask someone with access, such as the Owner." } }, 403);
  if (b.source === "ai_proposal" && !can(s.role, "ai.confirm")) return c.json({ ok: false, error: { code: "FORBIDDEN", title: "Your role can't confirm AI proposals", detail: "", recovery: "Ask the Owner." } }, 403);
  const out = await submit({ name: s.name, role: s.role }, type, b.payload ?? {}, b.source === "ai_proposal" ? "ai_proposal" : "user", { id: b.id, at: b.at, baseSeq: b.baseSeq });
  return c.json(out, out.ok ? 200 : ((out.status ?? 422) as 409 | 422));
});

app.onError((e, c) => { console.error(e); return c.json({ ok: false, error: { code: "SERVER_ERROR", title: "Something went wrong on our side", detail: "Nothing was saved.", recovery: "Try again." } }, 500); });

async function seedUsers() {
  if ((await pool.query("select count(*)::int as n from users")).rows[0].n > 0) return;
  if (mode === "empty") {
    if (!config.ownerEmail || config.ownerPassword.length < 8) throw new Error("COMPANY_MODE=empty needs OWNER_EMAIL and an OWNER_PASSWORD of at least 8 characters.");
    await pool.query("insert into users(email,name,title,role,emp_name,pw_hash) values ($1,$2,'Owner','owner',$2,$3)", [config.ownerEmail.toLowerCase(), config.ownerName, hashPassword(config.ownerPassword)]);
    console.log(`created the Owner account ${config.ownerEmail}`); return;
  }
  const pw = hashPassword(config.demoPassword);
  for (const p of PERSONAS) await pool.query("insert into users(email,name,title,role,emp_name,pw_hash) values ($1,$2,$3,$4,$5,$6)", [p.email, p.name, p.title, p.role, p.empName, pw]);
  console.log(`created ${PERSONAS.length} demo users (password from DEMO_PASSWORD)`);
}

export async function start() {
  await migrate(); await boot(); await seedUsers();
  const srv = serve({ fetch: app.fetch, port: config.port });
  console.log(`API listening on :${config.port}`);
  return srv;
}
export { app };
if (import.meta.url === `file://${process.argv[1]}`) start().catch((e) => { console.error(e); process.exit(1); });
