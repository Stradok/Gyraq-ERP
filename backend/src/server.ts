import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { hashPassword, issue, throttled, verify, verifyPassword, type Session } from "./auth";
import { config } from "./config";
import { migrate, pool } from "./db";
import { HANDLERS, PERSONAS, can, type Action, type CommandType } from "./engine";
import { boot, commandsSince, submit, world } from "./world";

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
  return c.json({ token: issue(s), user: { id: s.sub, email: s.email, name: s.name, title: u.title, role: s.role } });
});

const guard = async (c: Context<Env>, next: () => Promise<void>) => {
  const t = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  const s = t ? verify(t) : null;
  if (!s) return c.json({ error: "Sign in again." }, 401);
  c.set("session", s); await next();
};
app.use("/api/*", guard);

app.get("/api/me", (c) => c.json(c.get("session")));

/** Everything a browser needs to rebuild the shared state: the seed anchor and every command so far. */
app.get("/api/bootstrap", async (c) => c.json({ anchor: world.today, commands: await commandsSince(0), session: c.get("session") }));
app.get("/api/commands", async (c) => c.json({ commands: await commandsSince(Number(c.req.query("since") ?? 0)) }));

app.post("/api/commands", async (c) => {
  const s = c.get("session");
  const b = await c.req.json<{ type?: string; payload?: unknown; source?: "user" | "ai_proposal" }>().catch(() => ({} as { type?: string; payload?: unknown; source?: "user" | "ai_proposal" }));
  if (!b.type || !(b.type in HANDLERS)) return c.json({ ok: false, error: { code: "CMD_UNKNOWN", title: "Unknown action", detail: `No such command: ${b.type}`, recovery: "Refresh the page." } }, 400);
  const type = b.type as CommandType;
  const need = NEEDS[type];
  if (need && !can(s.role, need)) return c.json({ ok: false, error: { code: "FORBIDDEN", title: "Your role can't do this", detail: `${s.role.replace("_", " ")} is not allowed to ${type}.`, recovery: "Ask someone with access, such as the Owner." } }, 403);
  if (b.source === "ai_proposal" && !can(s.role, "ai.confirm")) return c.json({ ok: false, error: { code: "FORBIDDEN", title: "Your role can't confirm AI proposals", detail: "", recovery: "Ask the Owner." } }, 403);
  const out = await submit({ name: s.name, role: s.role }, type, b.payload ?? {}, b.source === "ai_proposal" ? "ai_proposal" : "user");
  return c.json(out, out.ok ? 200 : 422);
});

app.onError((e, c) => { console.error(e); return c.json({ ok: false, error: { code: "SERVER_ERROR", title: "Something went wrong on our side", detail: "Nothing was saved.", recovery: "Try again." } }, 500); });

async function seedUsers() {
  if ((await pool.query("select count(*)::int as n from users")).rows[0].n > 0) return;
  const pw = hashPassword(config.demoPassword);
  for (const p of PERSONAS) await pool.query("insert into users(email,name,title,role,emp_name,pw_hash) values ($1,$2,$3,$4,$5,$6)", [p.email, p.name, p.title, p.role, p.empName, pw]);
  console.log(`created ${PERSONAS.length} demo users (password from DEMO_PASSWORD)`);
}

export async function start() {
  await migrate(); await seedUsers(); await boot();
  const srv = serve({ fetch: app.fetch, port: config.port });
  console.log(`API listening on :${config.port}`);
  return srv;
}
export { app };
if (import.meta.url === `file://${process.argv[1]}`) start().catch((e) => { console.error(e); process.exit(1); });
