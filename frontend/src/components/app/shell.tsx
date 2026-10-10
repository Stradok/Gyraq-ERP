"use client";
import { useMe } from "@/lib/me";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ChevronsLeft, ChevronsRight, ChevronsUpDown, CircleHelp, Clock, Command, Menu, Moon, RotateCcw, Star, Sun } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "./logo";
import { Notifications } from "./notifications";
import { CommandPalette } from "./command-palette";
import { AssistantDock } from "./assistant-dock";
import { NAV, titleFor } from "@/lib/nav";
import { PERSONAS, ROLE_MODULES, canSee } from "@/lib/rbac";
import { useERP, useWorld } from "@/lib/store";
import { replayAll } from "@/lib/engine/client";
import { getUser, loadRemoteWorld, remote, signOut, startPolling } from "@/lib/engine/remote";
import { OfflineSupport } from "./offline";
import { useApprovals, useMounted } from "@/lib/hooks";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ORG } from "@/lib/data/catalog";
import { getDB } from "@/lib/data/queries";

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { role, favorites, recents } = useERP();
  const mounted = useMounted();
  const sections = ["", "Operations", "Finance", "People", "Insights", "System"];
  const items = NAV.filter((n) => canSee(role, n.module));
  const active = (href: string, label: string) => {
    const root = "/" + href.split("/")[1];
    return pathname === href || pathname.startsWith(root + "/") || pathname === root || (label === "Finance" && pathname.startsWith("/finance")) || (label === "Sales" && pathname.startsWith("/sales"));
  };
  const link = (href: string, label: string, Icon?: typeof Star, badge?: string) => {
    const isActive = active(href, label);
    const el = (
      <Link href={href} onClick={onNavigate} className={cn("group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground", isActive && "bg-sidebar-accent font-medium text-foreground", collapsed && "justify-center px-0")}>
        {Icon && <Icon className={cn("size-4 shrink-0", isActive && "text-primary")} />}
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && badge && <span className="ml-auto text-[11px] text-muted-foreground">{badge}</span>}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={href + label}><TooltipTrigger asChild>{el}</TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>
    ) : <div key={href + label}>{el}</div>;
  };
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
      {!collapsed && mounted && favorites.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70"><Star className="size-3" />Favorites</div>
          {favorites.map((f) => link(f.href, f.title))}
        </div>
      )}
      {!collapsed && mounted && recents.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70"><Clock className="size-3" />Recent</div>
          {recents.slice(0, 4).map((f) => link(f.href, f.title))}
        </div>
      )}
      {sections.map((sec) => {
        const group = items.filter((i) => i.section === sec);
        if (!group.length) return null;
        return (
          <div key={sec}>
            {sec && !collapsed && <div className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{sec}</div>}
            {sec && collapsed && <div className="mx-2 my-2 border-t" />}
            <div className="space-y-0.5">{group.map((i) => link(i.href, i.label, i.icon))}</div>
          </div>
        );
      })}
    </nav>
  );
}

function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const toggle = useERP((s) => s.toggleCollapsed);
  const [wh, setWh] = useState("all");
  const whs = getDB().warehouses;
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex h-14 items-center gap-2.5 border-b px-3.5", collapsed && "justify-center px-0")}>
        <Logo className="size-7 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">Meridian</div>
            <div className="truncate text-[11px] text-muted-foreground">{ORG.name}</div>
          </div>
        )}
      </div>
      <NavList collapsed={collapsed} onNavigate={onNavigate} />
      <div className="border-t p-2">
        {!collapsed && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mb-1 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
                <span className="size-1.5 rounded-full bg-success" />
                <span className="flex-1 truncate">{wh === "all" ? "All warehouses" : whs.find((w) => w.id === wh)?.code}</span>
                <ChevronsUpDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuLabel>Warehouse context</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setWh("all")}>All warehouses</DropdownMenuItem>
              {whs.map((w) => <DropdownMenuItem key={w.id} onClick={() => setWh(w.id)}>{w.code} · {w.city}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button onClick={toggle} className={cn("hidden h-8 w-full items-center gap-2 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:flex", collapsed && "justify-center px-0")}>
          {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" />Collapse</>}
        </button>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role, setRole, collapsed, visit, reset } = useERP();
  const mounted = useMounted();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const approvals = useApprovals();
  const pending = approvals.filter((a) => a.status === "pending").length;
  const persona = useMe();

  const version = useWorld((s) => s.version);
  useEffect(() => {
    if (!remote) { void Promise.resolve(useERP.persist.rehydrate()).then(() => replayAll()); return; }
    void useERP.persist.rehydrate();
    loadRemoteWorld().then((r) => { if (r === "auth") signOut(); else startPolling(); });
  }, []);
  useEffect(() => { if (pathname) visit({ href: pathname, title: titleFor(pathname) }); }, [pathname, visit]);
  useEffect(() => {
    let last = 0;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey) return;
      if (e.key === "[") useERP.getState().toggleCollapsed();
      if (e.key === "g") { last = Date.now(); return; }
      if (Date.now() - last < 800) {
        const m: Record<string, string> = { o: "/overview", s: "/sales/orders", c: "/customers", i: "/inventory", p: "/purchasing/orders", f: "/finance/statements", a: "/ai" };
        if (m[e.key]) router.push(m[e.key]!);
        last = 0;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [router]);
  // if the persona can't see the current module, send them home
  useEffect(() => {
    if (!mounted) return;
    const n = NAV.find((x) => pathname.startsWith("/" + x.href.split("/")[1]) && x.href !== "/overview");
    if (n && !canSee(role, n.module)) router.replace(ROLE_MODULES[role][0] === "overview" ? "/overview" : `/${ROLE_MODULES[role][0]}`);
  }, [role, pathname, mounted, router]);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className={cn("hidden shrink-0 border-r transition-[width] duration-150 md:block", mounted && collapsed ? "w-14" : "w-[232px]")}>
        <Sidebar collapsed={mounted && collapsed} />
      </aside>
      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[260px] p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar collapsed={false} onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur md:px-5">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNav(true)} aria-label="Menu"><Menu /></Button>
          <button onClick={() => setOpen(true)} className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border bg-muted/40 px-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted">
            <Command className="size-3.5" />
            <span className="flex-1 truncate">Search or run a command…</span>
            <kbd className="hidden rounded border bg-background px-1.5 font-mono text-[10px] sm:block">⌘K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            {canSee(role, "ai") && (
              <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex"><Link href="/ai"><span className="size-1.5 rounded-full bg-ai" />Ask</Link></Button>
            )}
            <OfflineSupport />
            <Button variant="ghost" size="sm" asChild className="relative gap-1.5">
              <Link href="/approvals">
                <span className="hidden sm:inline">Approvals</span>
                <Badge variant={pending ? "default" : "secondary"} className="min-w-5 justify-center px-1.5">{mounted ? pending : "·"}</Badge>
              </Link>
            </Button>
            <Notifications />
            <Tooltip>
              <TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{mounted && resolvedTheme === "light" ? <Moon /> : <Sun />}</Button></TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Help"><CircleHelp /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>What&apos;s simulated?</DropdownMenuLabel>
                <div className="space-y-1.5 px-2 pb-2 text-xs text-muted-foreground">
                  <p>All business data is a generated simulation (fictional company, brands and people).</p>
                  <p>FBR e-invoicing, email, WhatsApp and bank feeds are <b className="text-foreground">simulated</b>; nothing is sent externally.</p>
                  <p>Keyboard: <kbd className="rounded border px-1 font-mono">⌘K</kbd> search · <kbd className="rounded border px-1 font-mono">g</kbd> then <kbd className="rounded border px-1 font-mono">o s c i p f a</kbd> to jump · <kbd className="rounded border px-1 font-mono">[</kbd> collapse</p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-accent">
                  <Avatar className="size-7"><AvatarFallback className="bg-primary/15 text-[11px] font-medium text-primary">{initials(persona.name)}</AvatarFallback></Avatar>
                  <span className="hidden text-left leading-tight lg:block">
                    <span className="block text-[13px] font-medium">{persona.name}</span>
                    <span className="block text-[11px] text-muted-foreground">{persona.title}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex items-center justify-between">{remote ? (getUser()?.email ?? "Signed in") : "Demo persona"} <Badge variant="outline" className="text-[10px]">{remote ? "Live" : "Simulated"}</Badge></DropdownMenuLabel>
                {!remote && PERSONAS.map((p) => (
                  <DropdownMenuItem key={p.role} onClick={() => setRole(p.role)} className="items-start gap-2">
                    <span className={cn("mt-1 size-1.5 rounded-full", p.role === role ? "bg-primary" : "bg-transparent")} />
                    <span className="leading-tight"><span className="block text-[13px]">{p.name}</span><span className="block text-[11px] text-muted-foreground">{p.title}</span></span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {remote ? <DropdownMenuItem onClick={signOut}><RotateCcw />Sign out</DropdownMenuItem> : <DropdownMenuItem onClick={() => { reset(); setTimeout(() => window.location.reload(), 50); }}><RotateCcw />Reset demo data</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main key={version} className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandPalette open={open} setOpen={setOpen} />
      <AssistantDock />
    </div>
  );
}
