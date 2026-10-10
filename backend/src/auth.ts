import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config";
import type { Role } from "./engine";

export interface Session { sub: string; email: string; name: string; role: Role; emp: string; exp: number }

export function hashPassword(pw: string): string { const salt = randomBytes(16).toString("hex"); return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`; }
export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(":"); if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex"), b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
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
export function throttled(key: string): boolean {
  const now = Date.now(), w = (tries.get(key) ?? []).filter((t) => now - t < 300_000); w.push(now); tries.set(key, w); return w.length > 10;
}
