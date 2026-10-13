import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import { hashPassword, issue, pwVersion, throttled, verify, verifyPassword, type Session } from "./auth";
import { bodyLimit } from "hono/body-limit";
import { getConnInfo } from "@hono/node-server/conninfo";
import { config, trustProxy } from "./config";
import { log } from "./log";
import { migrate, pool } from "./db";
import { COMMAND_PERMISSIONS, HANDLERS, PERSONAS, can, type CommandType, type Role } from "./engine";
import { enforceScope } from "./scope";
import { boot, commandsSince, mode, readOnly, seedAnchor, snapshot, submit, world } from "./world";
import { compress } from "hono/compress";
import { reconcile } from "./integrity";

type Env = { Variables: { session: Session; rid: string } };
const app = new Hono<Env>();
app.use("*", cors({ origin: config.corsOrigin.includes("*") ? "*" : config.corsOrigin, allowHeaders: ["authorization", "content-type"] }));

app.use("*", compress());
app.use("*", bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "Request too large." }, 413) }));
app.use("*", async (c, next) => {
  const given = c.req.header("x-request-id"), rid = given && /^[\w-]{8,64}$/.test(given) ? given : crypto.randomUUID(), t0 = Date.now(); // a caller-chosen id is kept only if it is a plain token, so logs cannot be forged with newlines or junk
  c.set("rid", rid); c.header("x-request-id", rid);
  await next();
  log.info("request", { rid, method: c.req.method, path: new URL(c.req.url).pathname, status: c.res.status, ms: Date.now() - t0, user: c.get("session")?.sub });
});
const clientIp = (c: Context<Env>) => (trustProxy ? c.req.header("x-forwarded-for")?.split(",").pop()?.trim() : undefined) || getConnInfo(c).remote.address || "unknown";
async function authEvent(c: Context<Env>, event: string, ok: boolean, email: string | undefined, detail?: string, actor?: string, db: { query: typeof pool.query } = pool) {
  await db.query("insert into auth_events(event,ok,email,actor,ip,request_id,detail) values ($1,$2,$3,$4,$5,$6,$7)", [event, ok, email?.toLowerCase() ?? null, actor ?? null, clientIp(c), c.get("rid"), detail ?? null]).catch((e) => log.error("auth_event_failed", { err: String(e) }));
}

app.get("/health", async (c) => { await pool.query("select 1"); return c.json({ ok: !readOnly, anchor: world.today, paused: !!readOnly }); });

app.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>().catch(() => ({} as { email?: string; password?: string }));
  if (!email || !password) return c.json({ error: "Enter your email and password." }, 400);
  if (email.length > 254 || password.length > 256) return c.json({ error: "Wrong email or password." }, 401); // bounded work per attempt
  if (throttled(`${clientIp(c)}|${email.toLowerCase()}`) || throttled(`ip:${clientIp(c)}`, 30)) return c.json({ error: "Too many attempts. Wait a few minutes." }, 429);
  // Lockout, per account and per client address: 5 failed sign-ins from one address in 15 minutes locks that address out of that
  // account, so a stranger cannot lock the real owner out from elsewhere. 50 failures from anywhere also lock the account for the
  // window (distributed guessing). The check, the password test and the event write run under one per-account advisory lock,
  // so parallel requests cannot slip extra guesses past the limit.
  const em = email.toLowerCase(), ip = clientIp(c), cx = await pool.connect();
  let u: Record<string, unknown> | undefined, locked = false, good = false, busy = false;
  try {
    await cx.query("begin");
    // try-lock: if another attempt on this account is mid-check, refuse at once instead of queueing. A queue of waiting
    // attempts would hold database connections and let one attacker starve the whole API.
    if (!(await cx.query("select pg_try_advisory_xact_lock(hashtext($1)) as ok", [em])).rows[0].ok) busy = true;
    if (!busy) {
    const f = (await cx.query("select count(*) filter (where ip = $2)::int as here, count(*)::int as total from auth_events where event='login' and not ok and email=$1 and at > now() - interval '15 minutes'", [em, ip])).rows[0];
    if (f.here >= 5 || f.total >= 50) { locked = true; await authEvent(c, "login_locked", false, email, undefined, undefined, cx); }
    else {
      u = (await cx.query("select * from users where lower(email)=$1 and active", [em])).rows[0];
      good = await verifyPassword(password, u?.pw_hash as string | undefined);
      await authEvent(c, "login", good, email, good ? undefined : u ? "bad password" : "unknown or disabled account", undefined, cx); // same connection: a pool-wide wait here would deadlock when many logins queue on the lock
    }
    }
    await cx.query("commit");
  } catch (e) { await cx.query("rollback").catch(() => undefined); throw e; } finally { cx.release(); }
  if (busy) return c.json({ error: "Another sign-in for this account is in progress. Try again in a moment." }, 429);
  if (locked) return c.json({ error: "Too many failed attempts. Try again in 15 minutes." }, 429);
  if (!good || !u) return c.json({ error: "Wrong email or password." }, 401);
  const s = { sub: u.id as string, email: u.email as string, name: u.name as string, role: u.role as Role, emp: u.emp_name as string, pv: pwVersion(u.pw_hash as string) };
  return c.json({ token: issue(s), user: { id: s.sub, email: s.email, name: s.name, title: u.title, role: s.role, emp: s.emp } });
});

const guard = async (c: Context<Env>, next: () => Promise<void>) => {
  const t = (c.req.header("authorization") ?? "").replace(/^Bearer /, "");
  const s = t ? verify(t) : null;
  if (!s) return c.json({ error: "Sign in again." }, 401);
  // Role and active flag come from the database each time, so a change or deactivation takes effect at once.
  const u = (await pool.query("select role, active, pw_hash from users where id=$1", [s.sub])).rows[0];
  if (!u?.active) return c.json({ error: "This account is disabled." }, 401);
  if (s.pv !== pwVersion(u.pw_hash)) return c.json({ error: "Your password changed. Sign in again." }, 401);
  c.set("session", { ...s, role: u.role }); await next();
};
app.use("/api/*", guard);

app.get("/api/me", async (c) => { const s = c.get("session"); const u = (await pool.query("select title from users where id=$1", [s.sub])).rows[0]; return c.json({ ...s, title: u?.title ?? "" }); });

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
  if (email.length > 254 || name.length > 100 || (b.title ?? "").length > 100 || (b.emp ?? "").length > 100) return c.json({ error: "Name, title or email is too long." }, 400);
  if (name.length < 3) return c.json({ error: "Enter the person's full name." }, 400);
  if (!b.role || !ROLES.includes(b.role)) return c.json({ error: "Pick a role." }, 400);
  if (b.role === "owner" && c.get("session").role !== "owner") return c.json({ error: "Only an Owner can create another Owner." }, 403);
  if ((b.password ?? "").length < 8 || (b.password ?? "").length > 128) return c.json({ error: "Password must be 8 to 128 characters." }, 400);
  const emp = b.emp || name; // the employee record this person acts as (leave, expenses); may be added later
  if ((await pool.query("select 1 from users where lower(email)=$1", [email])).rowCount) return c.json({ error: "A user with this email already exists." }, 409);
  const r = await pool.query("insert into users(email,name,title,role,emp_name,pw_hash) values ($1,$2,$3,$4,$5,$6) returning id", [email, name, b.title ?? "", b.role, emp, await hashPassword(b.password!)]);
  await authEvent(c, "user_created", true, email, `role ${b.role}`, c.get("session").email);
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
  if (b.password !== undefined && (b.password.length < 8 || b.password.length > 128)) return c.json({ error: "Password must be 8 to 128 characters." }, 400);
  if (b.title !== undefined && b.title.length > 100) return c.json({ error: "Title is too long." }, 400);
  const demotes = (target.role === "owner" && ((b.role && b.role !== "owner") || b.active === false));
  if (demotes && (await pool.query("select count(*)::int n from users where role='owner' and active")).rows[0].n < 2) return c.json({ error: "There must always be at least one active Owner." }, 400);
  await pool.query("update users set role=coalesce($2,role), active=coalesce($3,active), title=coalesce($4,title), pw_hash=coalesce($5,pw_hash) where id=$1", [id, b.role ?? null, b.active ?? null, b.title ?? null, b.password ? await hashPassword(b.password) : null]);
  await authEvent(c, b.password ? "password_reset" : "user_updated", true, undefined, `user ${id}: ${JSON.stringify({ role: b.role, active: b.active, title: b.title })}`, s.email);
  return c.json({ ok: true });
});

// Owner/Admin: run the books-agree-with-themselves checks now.
app.get("/api/health/integrity", (c) => isAdmin(c.get("session")) ? c.json({ ok: reconcile(world).length === 0, paused: !!readOnly, problems: reconcile(world) }) : noAccess(c));

/** Everything a browser needs to rebuild the shared state: the seed anchor and every command so far. */
// A company that started empty is served as a state snapshot (its size follows its data, not its history); the demo company is
// cheaper to rebuild in the browser from the seed plus its few commands. `?snapshot=1` forces a snapshot.
app.get("/api/bootstrap", async (c) => {
  if (mode === "empty" || c.req.query("snapshot") === "1") { const snap = await snapshot(); return c.json({ anchor: seedAnchor, today: world.today, mode, seq: snap.seq, state: snap.state, commands: [], session: c.get("session") }); }
  return c.json({ anchor: seedAnchor, today: world.today, mode, commands: await commandsSince(0), session: c.get("session") });
});
app.get("/api/commands", async (c) => c.json({ commands: await commandsSince(Number(c.req.query("since") ?? 0)) }));

app.post("/api/commands", async (c) => {
  const s = c.get("session");
  const b = await c.req.json<{ type?: string; payload?: unknown; source?: "user" | "ai_proposal"; id?: string; at?: string; baseSeq?: number }>().catch(() => ({} as { type?: string; payload?: unknown; source?: "user" | "ai_proposal"; id?: string; at?: string; baseSeq?: number }));
  if (typeof b.type !== "string" || (b.id !== undefined && (typeof b.id !== "string" || !/^[\w-]{6,64}$/.test(b.id))) || (b.baseSeq !== undefined && !Number.isSafeInteger(b.baseSeq)) || (b.source !== undefined && b.source !== "user" && b.source !== "ai_proposal")) return c.json({ ok: false, error: { code: "BAD_ID", title: "Bad command id", detail: "", recovery: "Refresh the page." } }, 400);
  if (!b.type || !(b.type in HANDLERS)) return c.json({ ok: false, error: { code: "CMD_UNKNOWN", title: "Unknown action", detail: `No such command: ${b.type}`, recovery: "Refresh the page." } }, 400);
  const type = b.type as CommandType;
  // Default-deny: a command with no entry in COMMAND_PERMISSIONS (frontend/src/lib/engine/permissions.ts) is refused.
  const rule = COMMAND_PERMISSIONS[type];
  if (!rule || !can(s.role, rule.permission)) return c.json({ ok: false, error: { code: "FORBIDDEN", title: "Your role can't do this", detail: `${s.role.replace("_", " ")} is not allowed to ${type}.`, recovery: "Ask someone with access, such as the Owner." } }, 403);
  if (b.source === "ai_proposal" && !can(s.role, "ai.confirm")) return c.json({ ok: false, error: { code: "FORBIDDEN", title: "Your role can't confirm AI proposals", detail: "", recovery: "Ask the Owner." } }, 403);
  const scoped = enforceScope(world, { name: s.name, role: s.role, emp: s.emp }, type, b.payload);
  if (!scoped.ok) return c.json({ ok: false, error: { code: scoped.code, title: scoped.title, detail: scoped.detail, recovery: "Ask the Owner if this should be allowed." } }, 403);
  const out = await submit({ name: s.name, role: s.role }, type, scoped.payload, b.source === "ai_proposal" ? "ai_proposal" : "user", { id: b.id, baseSeq: b.baseSeq });
  return c.json(out, out.ok ? 200 : ((out.status ?? 422) as 409 | 422));
});

app.onError((e, c) => { log.error("unhandled", { rid: c.get("rid"), err: String(e), stack: e instanceof Error ? e.stack : undefined }); return c.json({ ok: false, error: { code: "SERVER_ERROR", title: "Something went wrong on our side", detail: "Nothing was saved.", recovery: "Try again." } }, 500); });

async function seedUsers() {
  if ((await pool.query("select count(*)::int as n from users")).rows[0].n > 0) return;
  if (mode === "empty") {
    if (!config.ownerEmail || config.ownerPassword.length < 8) throw new Error("COMPANY_MODE=empty needs OWNER_EMAIL and an OWNER_PASSWORD of at least 8 characters.");
    await pool.query("insert into users(email,name,title,role,emp_name,pw_hash) values ($1,$2,'Owner','owner',$2,$3)", [config.ownerEmail.toLowerCase(), config.ownerName, await hashPassword(config.ownerPassword)]);
    log.info("owner_created", { email: config.ownerEmail }); return;
  }
  const pw = await hashPassword(config.demoPassword);
  for (const p of PERSONAS) await pool.query("insert into users(email,name,title,role,emp_name,pw_hash) values ($1,$2,$3,$4,$5,$6)", [p.email, p.name, p.title, p.role, p.empName, pw]);
  log.info("demo_users_created", { count: PERSONAS.length });
}

export async function start() {
  if (process.env.NODE_ENV === "production" && !trustProxy) log.warn("trust_proxy_off", { hint: "behind a reverse proxy every client shares its address, so one person's failed sign-ins lock others out. Set TRUST_PROXY=1 when a proxy is in front." });
  await migrate(); await boot(); await seedUsers();
  const srv = serve({ fetch: app.fetch, port: config.port });
  log.info("listening", { port: config.port, mode });
  return srv;
}
export { app };
if (import.meta.url === `file://${process.argv[1]}`) start().catch((e) => { console.error(e); process.exit(1); });
