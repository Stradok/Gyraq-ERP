// Server-side identity for the AI routes. In remote mode (a backend is configured) who the caller is and what role they hold
// come from the backend, using their token. Nothing the browser says about its own role is believed.
import type { Role } from "../rbac";

export interface Caller { name: string; title: string; role: Role }

export function backendUrl(): string | undefined { return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? undefined; }

/** undefined = no backend configured (public demo). null = backend configured but the token is missing or invalid. */
export async function verifyCaller(token: string | undefined): Promise<Caller | null | undefined> {
  const api = backendUrl();
  if (!api) return undefined;
  if (!token) return null;
  const r = await fetch(`${api}/api/me`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
  if (!r?.ok) return null;
  const me = (await r.json()) as { name: string; role: Role; title?: string };
  return { name: me.name, title: me.title ?? "", role: me.role };
}

export const bearer = (req: Request) => (req.headers.get("authorization") ?? "").replace(/^Bearer /, "") || undefined;
