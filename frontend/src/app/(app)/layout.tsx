export const dynamic = "force-dynamic"; // data is anchored to today; never prerender with a stale build date
import { AppShell } from "@/components/app/shell";
export default function AppLayout({ children }: LayoutProps<"/">) { return <AppShell>{children}</AppShell>; }
