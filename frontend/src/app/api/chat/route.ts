import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import type { z } from "zod";
import { COMMAND_CENTER } from "@/lib/ai/prompt";
import { aiEnabled, getModel } from "@/lib/ai/provider";
import { TOOLS, runTool, type ToolName } from "@/lib/ai/tools";
import { todayPK } from "@/lib/data/dates";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Best-effort per-instance rate limit (free tier is 20 req/min). Replace with a shared limiter in production.
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now(), win = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  win.push(now); hits.set(ip, win);
  return win.length > 8;
}

export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "AI provider not configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (limited(ip)) return Response.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  const body = (await req.json()) as { messages: UIMessage[]; user?: { name: string; title: string }; page?: string };
  const messages = body.messages.slice(-12);
  const tools = Object.fromEntries((Object.keys(TOOLS) as ToolName[]).map((name) => [name, tool({
    description: TOOLS[name].description,
    inputSchema: TOOLS[name].input as unknown as z.ZodType<Record<string, unknown>>,
    execute: async (args: Record<string, unknown>) => { const r = runTool(name, args); return { summary: r.summary, ui: r.ui, records: r.records, metrics: r.metrics }; },
    // The model reads only the compact summary; the UI payload is rendered client-side.
    toModelOutput: ({ output }) => ({ type: "text", value: (output as { summary: string }).summary }),
  })]));
  const result = streamText({
    model: getModel(COMMAND_CENTER.tier),
    system: COMMAND_CENTER.system(body.user ?? { name: "the user", title: "Manager" }, todayPK(), body.page),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(8),
    temperature: COMMAND_CENTER.temperature,
    timeout: 45_000,
  });
  return result.toUIMessageStreamResponse();
}
