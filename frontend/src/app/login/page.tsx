"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login, remote } from "@/lib/engine/remote";
import { PERSONAS } from "@/lib/rbac";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const go = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); const m = await login(email, pw); setErr(m); setBusy(false); if (!m) router.push("/overview"); };
  if (!remote) return <main className="grid min-h-dvh place-items-center p-6 text-sm text-muted-foreground">This is the public demo; no sign-in needed. <a className="ml-1 underline" href="overview">Open the app</a></main>;
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <form onSubmit={go} className="w-full max-w-sm space-y-4 rounded-xl border bg-card p-6">
        <div><h1 className="text-lg font-medium">Meridian ERP</h1><p className="text-sm text-muted-foreground">Sign in to your company workspace.</p></div>
        <Input aria-label="Email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input aria-label="Password" type="password" autoComplete="current-password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy || !email || !pw}>{busy ? "Signing in…" : "Sign in"}</Button>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Demo accounts</summary><ul className="mt-2 space-y-1">{PERSONAS.map((p) => <li key={p.role}><button type="button" className="hover:text-foreground" onClick={() => setEmail(p.email)}>{p.title}: {p.email}</button></li>)}</ul></details>
      </form>
    </main>
  );
}
