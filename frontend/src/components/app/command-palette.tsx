"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Filter, MessagesSquare } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { NAV, TABS } from "@/lib/nav";
import { canSee } from "@/lib/rbac";
import { useERP } from "@/lib/store";
import { search } from "@/lib/search";
import { interpret } from "@/lib/nl";

const ACTIONS = [
  { label: "Create sales order", href: "/sales/orders/new", hint: "c o" },
  { label: "Create quotation", href: "/sales/quotes", hint: "c q" },
  { label: "Record payment", href: "/sales/payments?new=1", hint: "" },
  { label: "Create purchase order", href: "/purchasing/orders?new=1", hint: "c p" },
  { label: "Transfer inventory", href: "/warehouses?transfer=1", hint: "" },
  { label: "Run cash-flow report", href: "/finance/cashflow", hint: "" },
  { label: "View overdue invoices", href: "/sales/invoices?status=overdue", hint: "" },
  { label: "Open AI assistant", href: "/ai", hint: "" },
  { label: "Review replenishment recommendations", href: "/inventory/replenishment", hint: "" },
  { label: "Open approvals", href: "/approvals", hint: "" },
];

export function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const router = useRouter();
  const role = useERP((s) => s.role);
  const [q, setQ] = useState("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(!open); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, setOpen]);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  const go = (href: string) => { setOpen(false); router.push(href); };
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => (needle.length > 1 ? search(needle, 10) : []), [needle]);
  const nl = useMemo(() => (needle.length > 5 ? interpret(needle) : null), [needle]);
  const nav = NAV.filter((n) => canSee(role, n.module));
  const tabs = nav.flatMap((n) => (TABS[n.module] ?? []).map((t) => ({ ...t, group: n.label })));
  const match = (s: string) => !needle || s.toLowerCase().includes(needle);

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Search records, run actions, or ask a question" className="max-w-xl">
      <CommandInput placeholder="Search records, run a command, or describe what you want to see…" value={q} onValueChange={setQ} />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No results. Try a customer, invoice number, or a question like “overdue customers in Karachi over 1 million”.</CommandEmpty>
        {nl && (
          <>
            <CommandGroup heading="Interpreted query">
              <CommandItem value={`nl-${needle}`} onSelect={() => go(nl.href)}>
                <Filter className="text-primary" />
                <span className="flex flex-1 flex-wrap items-center gap-1.5">
                  <span className="text-muted-foreground">Customers where</span>
                  {nl.chips.map((c) => <span key={c} className="rounded border bg-accent px-1.5 py-0.5 text-[11px]">{c}</span>)}
                </span>
                <span className="text-xs text-muted-foreground">{nl.count} result{nl.count === 1 ? "" : "s"}</span>
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {hits.length > 0 && (
          <CommandGroup heading="Records">
            {hits.map((h) => (
              <CommandItem key={h.type + h.id} value={`${h.type} ${h.title} ${h.id}`} onSelect={() => go(h.href)}>
                <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{h.type}</span>
                <span className="min-w-0 flex-1 truncate">{h.title}</span>
                <span className="hidden truncate text-xs text-muted-foreground sm:block">{h.subtitle}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Actions">
          {ACTIONS.filter((a) => match(a.label)).map((a) => (
            <CommandItem key={a.label} value={`action ${a.label}`} onSelect={() => go(a.href)}>
              <ArrowRight className="text-muted-foreground" />
              {a.label}
              {a.hint && <span className="ml-auto font-mono text-[10px] text-muted-foreground">{a.hint}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Go to">
          {tabs.filter((t) => match(`${t.group} ${t.label}`)).slice(0, needle ? 12 : 8).map((t) => (
            <CommandItem key={t.href} value={`go ${t.group} ${t.label}`} onSelect={() => go(t.href)}>
              <span className="w-24 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">{t.group}</span>
              {t.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {needle.length > 2 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Ask">
              <CommandItem value={`ask ${needle}`} onSelect={() => go(`/ai?q=${encodeURIComponent(q)}`)}>
                <MessagesSquare className="text-ai" />
                Ask: <span className="truncate text-muted-foreground">{q}</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
