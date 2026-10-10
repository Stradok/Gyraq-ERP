import { CalendarClock } from "lucide-react";

// Where the live agents are not running (public demo), say so plainly and point to booking a session.
export const BOOK_URL = process.env.NEXT_PUBLIC_BOOK_URL ?? "https://www.gyraq.com";
export function BookSlot({ what = "Live AI agents", className }: { what?: string; className?: string }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-md border border-dashed bg-subtle px-3 py-2.5 text-xs text-muted-foreground ${className ?? ""}`}>
      <CalendarClock className="mt-0.5 size-4 shrink-0" />
      <p>{what} aren&apos;t running in this public demo, so you&apos;re seeing the simulated version. <a href={BOOK_URL} target="_blank" rel="noreferrer" className="font-medium text-foreground underline underline-offset-2">Book a slot</a> and we&apos;ll show the real agents working on your own data.</p>
    </div>
  );
}
