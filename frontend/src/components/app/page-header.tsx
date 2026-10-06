"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star } from "lucide-react";
import { TABS } from "@/lib/nav";
import type { Module } from "@/lib/rbac";
import { useERP } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, module, back, meta }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; module?: Module; back?: { href: string; label: string }; meta?: React.ReactNode }) {
  const pathname = usePathname();
  const tabs = module ? TABS[module] : undefined;
  const { favorites, toggleFavorite } = useERP();
  const mounted = useMounted();
  const fav = mounted && favorites.some((f) => f.href === pathname);
  return (
    <div className="border-b bg-background">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 md:px-6">
        <div className="min-w-0">
          {back && <Link href={back.href} className="mb-1 inline-block text-xs text-muted-foreground hover:text-foreground">← {back.label}</Link>}
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            <button aria-label="Favorite" onClick={() => toggleFavorite({ href: pathname, title: typeof title === "string" ? title : pathname })} className="text-muted-foreground/60 hover:text-warning">
              <Star className={cn("size-4", fav && "fill-warning text-warning")} />
            </button>
          </div>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
          {meta && <div className="mt-2">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {tabs ? (
        <div className="mt-3 flex gap-1 overflow-x-auto px-4 md:px-6">
          {tabs.map((t) => {
            const active = pathname === t.href || (t.href !== tabs[0]!.href && pathname.startsWith(t.href + "/")) || (t.href === tabs[0]!.href && pathname.startsWith(t.href + "/"));
            return (
              <Link key={t.href} href={t.href} className={cn("relative whitespace-nowrap px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:text-foreground", active && "font-medium text-foreground")}>
                {t.label}
                {active && <span className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </div>
      ) : <div className="h-3" />}
    </div>
  );
}

export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("fade-up space-y-5 p-4 md:p-6", className)}>{children}</div>;
}

export function Section({ title, description, actions, children, className, flush }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <div className="text-sm font-medium">{title}</div>
      {body && <div className="max-w-sm text-xs text-muted-foreground">{body}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
