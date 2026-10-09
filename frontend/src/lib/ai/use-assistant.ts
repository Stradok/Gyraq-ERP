"use client";
// One assistant engine for the Command Center page and the floating dock.
// LLM mode streams from /api/chat (tools run server-side); computed mode answers from the same tools locally.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { answerLocal } from "./local";
import type { ToolResult } from "./tools";
import { withBase } from "../config";
import { useERP } from "../store";

export interface VMsg { id: string; role: "user" | "assistant"; text: string; steps: { name: string; done: boolean }[]; results: ToolResult[]; computed?: boolean; suggestions?: string[]; insufficient?: boolean }
export interface LlmStatus { enabled: boolean; model: string; provider: string }

export function useAssistant(user: { name: string; title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [msgs, setMsgs] = useState<VMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const topic = useRef<string | undefined>(undefined);
  const handled = useRef(new Set<string>());
  useEffect(() => { fetch(withBase("/api/ai/status")).then((r) => r.json()).then(setLlm).catch(() => setLlm({ enabled: false, model: "", provider: "" })); }, []);
  const chat = useChat({ transport: new DefaultChatTransport({ api: withBase("/api/chat"), body: () => ({ user, page: pathname, commands: useERP.getState().commands, anchor: useERP.getState().anchor }) }) });
  const useLlm = !!llm?.enabled;

  const llmMsgs: VMsg[] = useMemo(() => chat.messages.map((m) => {
    const parts = m.parts as { type: string; text?: string; state?: string; output?: ToolResult }[];
    return { id: m.id, role: m.role as "user" | "assistant", text: parts.filter((p) => p.type === "text").map((p) => p.text).join(""), steps: parts.filter((p) => p.type.startsWith("tool-")).map((p) => ({ name: p.type.slice(5), done: p.state === "output-available" })), results: parts.filter((p) => p.type.startsWith("tool-") && p.output).map((p) => p.output as ToolResult) };
  }), [chat.messages]);
  const view = useLlm ? llmMsgs : msgs;
  const loading = useLlm ? chat.status === "submitted" || chat.status === "streaming" : busy;
  const error = useLlm ? chat.error : undefined;

  // Navigation tool results move the user's screen exactly once.
  useEffect(() => {
    for (const m of view) m.results.forEach((r, i) => {
      const k = `${m.id}:${i}`;
      if (r.ui.kind === "navigate" && !handled.current.has(k)) { handled.current.add(k); router.push(r.ui.path); }
    });
  }, [view, router]);

  const send = async (text: string) => {
    const q = text.trim(); if (!q || loading) return;
    if (useLlm) { void chat.sendMessage({ text: q }); return; }
    const id = Date.now().toString();
    setMsgs((m) => [...m, { id: id + "u", role: "user", text: q, steps: [], results: [] }]);
    setBusy(true);
    const a = answerLocal(q, topic.current);
    topic.current = a.topic;
    const base: VMsg = { id: id + "a", role: "assistant", text: "", steps: a.steps.map((s) => ({ name: s.tool, done: false })), results: [], computed: true, suggestions: a.suggestions, insufficient: a.status === "insufficient_data" };
    setMsgs((m) => [...m, base]);
    for (let i = 0; i < a.steps.length; i++) { await new Promise((r) => setTimeout(r, 350)); setMsgs((m) => m.map((x) => (x.id === base.id ? { ...x, steps: x.steps.map((s, k) => (k <= i ? { ...s, done: true } : s)) } : x))); }
    await new Promise((r) => setTimeout(r, 200));
    setMsgs((m) => m.map((x) => (x.id === base.id ? { ...x, text: a.text, results: a.results } : x)));
    setBusy(false);
  };
  const reset = () => { setMsgs([]); chat.setMessages([]); topic.current = undefined; };
  return { llm, view, loading, send, reset, useLlm, error };
}
