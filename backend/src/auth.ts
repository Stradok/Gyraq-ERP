import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { config } from "./config";
import type { Role } from "./engine";

export interface Session { sub: string; email: string; name: string; role: Role; emp: string; exp: number }

// Async scrypt: the hashing runs on the thread pool, so a flood of sign-in attempts cannot freeze the whole server.
const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
export async function hashPassword(pw: string): Promise<string> { const salt = randomBytes(16).toString("hex"); return `${salt}:${(await scryptAsync(pw, salt, 64)).toString("hex")}`; }
const DUMMY = `${"0".repeat(32)}:${"0".repeat(128)}`; // checked when the account doesn't exist, so response time doesn't reveal which emails are registered
export async function verifyPassword(pw: string, stored: string | undefined): Promise<boolean> {
  const [salt, hash] = (stored ?? DUMMY).split(":"); if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex"), b = await scryptAsync(pw, salt, 64);
  return stored !== undefined && a.length === b.length && timingSafeEqual(a, b);
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (data: string) => createHmac("sha256", config.jwtSecret).update(data).digest();
export function issue(s: Omit<Session, "exp">): string {
  const body = b64(JSON.stringify({ ...s, exp: Math.floor(Date.now() / 1000) + config.tokenHours * 3600 }));
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  return `${head}.${body}.${b64(sign(`${head}.${body}`))}`;
}
export function verify(token: string): Session | null {
  const [h, b, s] = token.split("."); if (!h || !b || !s) return null;
  const want = sign(`${h}.${b}`), got = Buffer.from(s, "base64url");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const claims = JSON.parse(Buffer.from(b, "base64url").toString()) as Session;
  return claims.exp > Date.now() / 1000 ? claims : null;
}

// Login throttle: 10 tries per 5 minutes per address+email. In-memory is enough for a single self-hosted instance.
const tries = new Map<string, number[]>();
/** Sliding window: more than `max` calls with the same key in `ms`. */
export function throttled(key: string, max = 10, ms = 300_000): boolean {
  const now = Date.now(), w = (tries.get(key) ?? []).filter((t) => now - t < ms); w.push(now); tries.set(key, w); return w.length > max;
}
