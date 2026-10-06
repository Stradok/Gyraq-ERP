"use client";
import { useEffect, useState } from "react";
import { Page, PageHeader, Section } from "@/components/app/page-header";
import { KeyValue } from "@/components/app/entity";
import { StatusBadge } from "@/components/app/status";
import { withBase } from "@/lib/config";
import { TOOLS } from "@/lib/ai/tools";

export default function AiSettings() {
  const [s, setS] = useState<{ enabled: boolean; provider: string; model: string; fallbacks: string[] } | null>(null);
  useEffect(() => { fetch(withBase("/api/ai/status")).then((r) => r.json()).then(setS).catch(() => undefined); }, []);
  return (
    <>
      <PageHeader module="settings" title="Settings" description="AI provider, models and tools. The provider is swappable by environment variable; business code never talks to a vendor directly." />
      <Page>
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Provider" actions={s && <StatusBadge status={s.enabled ? "active" : "draft"} label={s.enabled ? "Connected" : "No key: computed mode"} />}><KeyValue items={[["Provider", s?.provider ?? "…"], ["Primary model", s?.model ?? "…"], ["Fallbacks", s?.fallbacks.join(", ") || "—"], ["Env", "AI_PROVIDER, OPENROUTER_API_KEY, AI_MODEL_REASONING"]]} /></Section>
          <Section title="Safety"><ul className="space-y-1.5 text-[13px] text-muted-foreground"><li>· The model is an untrusted reasoning service; the ERP database stays authoritative.</li><li>· Tools run as the signed-in user with their permissions.</li><li>· Write actions are proposals a person must confirm; approval rules still apply.</li><li>· Rate limited and step-limited; every confirmed proposal is audited.</li></ul></Section>
        </div>
        <Section title="Tools exposed to the model" flush><ul className="divide-y text-[13px]">{Object.entries(TOOLS).map(([n, t]) => <li key={n} className="flex gap-4 px-4 py-2"><span className="w-60 shrink-0 font-mono text-xs">{n}</span><span className="text-muted-foreground">{t.description}</span></li>)}</ul></Section>
      </Page>
    </>
  );
}
