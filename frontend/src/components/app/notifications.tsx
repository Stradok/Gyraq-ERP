"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications } from "@/lib/hooks";
import { useERP } from "@/lib/store";
import { getDB } from "@/lib/data/queries";
import { relDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const DOT = { info: "bg-info", warning: "bg-warning", danger: "bg-danger", success: "bg-success" } as const;

export function Notifications() {
  const items = useNotifications();
  const markRead = useERP((s) => s.markRead);
  const unread = items.filter((n) => !n.read).length;
  const today = getDB().today;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {unread > 0 && <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-danger text-[10px] font-semibold text-background">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => markRead(items.map((n) => n.id))}>Mark all read</button>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.map((n) => (
            <Link key={n.id} href={n.href} onClick={() => markRead([n.id])} className={cn("flex gap-3 border-b px-3 py-2.5 last:border-0 hover:bg-accent", !n.read && "bg-accent/40")}>
              <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT[n.severity], n.read && "opacity-30")} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">{n.title}</span>
                <span className="block text-xs text-muted-foreground">{n.body}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground/70">{relDate(n.at.slice(0, 10), today)} · {n.at.slice(11, 16)}</span>
              </span>
            </Link>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
