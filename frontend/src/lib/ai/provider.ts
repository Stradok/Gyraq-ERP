// Provider abstraction (docs/plan/06 §3). Business code asks for a tier; this file is the only place that knows about
// OpenRouter / Anthropic / Gemini. Which provider serves which tier is decided by the edition the customer bought:
//   demo      free OpenRouter models for everything (public demo)
//   standard  Gemini Flash family: cheapest capable models for chat, quick tasks and documents
//   premium   Claude for reasoning and agents, Claude Haiku for quick tasks, Gemini Flash for document vision (cheapest accurate)
// Override any single tier with AI_PROVIDER_<TIER> / AI_MODEL_<TIER>. A tier whose provider has no key falls back to one that has.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type Tier = "fast" | "reasoning" | "vision" | "agent";
export type Provider = "openrouter" | "anthropic" | "gemini";
export type Edition = "demo" | "standard" | "premium";
const TIERS: Tier[] = ["reasoning", "fast", "vision", "agent"];
const list = (v: string | undefined, d: string[]) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);

// Model ids change; verify against each vendor's model list when you onboard a customer and override via env if needed.
const MODELS: Record<Provider, Record<Tier, string[]>> = {
  openrouter: {
    reasoning: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"],
    agent: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free"],
    fast: ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"],
    vision: ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"],
  },
  anthropic: { reasoning: ["claude-sonnet-5-5"], agent: ["claude-sonnet-5-5"], fast: ["claude-haiku-5-5"], vision: ["claude-sonnet-5-5"] },
  gemini: { reasoning: ["gemini-2.5-flash"], agent: ["gemini-2.5-pro"], fast: ["gemini-2.5-flash-lite"], vision: ["gemini-2.5-flash"] },
};
const EDITIONS: Record<Edition, Record<Tier, Provider>> = {
  demo: { reasoning: "openrouter", fast: "openrouter", vision: "openrouter", agent: "openrouter" },
  standard: { reasoning: "gemini", fast: "gemini", vision: "gemini", agent: "gemini" },
  premium: { reasoning: "anthropic", fast: "anthropic", vision: "gemini", agent: "anthropic" },
};
const KEYS: Record<Provider, string> = { openrouter: "OPENROUTER_API_KEY", anthropic: "ANTHROPIC_API_KEY", gemini: "GOOGLE_GENERATIVE_AI_API_KEY" };
const hasKey = (p: Provider) => !!process.env[KEYS[p]];
const asProvider = (v: string | undefined): Provider | undefined => (v === "openrouter" || v === "anthropic" || v === "gemini" ? v : undefined);

export function edition(): Edition {
  const e = (process.env.AI_EDITION ?? "").toLowerCase();
  if (e === "standard" || e === "premium" || e === "demo") return e;
  const legacy = asProvider((process.env.AI_PROVIDER ?? "").toLowerCase()); // older single-provider setting
  return legacy === "anthropic" ? "premium" : legacy === "gemini" ? "standard" : "demo";
}

/** The provider and ordered model list that will serve a tier right now. */
export function route(tier: Tier): { provider: Provider; models: string[] } | null {
  const wanted = asProvider(process.env[`AI_PROVIDER_${tier.toUpperCase()}`]?.toLowerCase()) ?? EDITIONS[edition()][tier];
  const order: Provider[] = [wanted, "anthropic", "gemini", "openrouter"].filter((p, i, a) => a.indexOf(p) === i) as Provider[];
  const provider = order.find(hasKey);
  if (!provider) return null;
  const override = process.env[`AI_MODEL_${tier.toUpperCase()}`] ?? (tier === "reasoning" ? process.env.AI_MODEL : undefined);
  return { provider, models: list(provider === wanted ? override : undefined, MODELS[provider][tier]) };
}

export function aiEnabled(): boolean { return !!route("reasoning"); }

export function aiInfo() {
  const r = route("reasoning");
  const tiers = Object.fromEntries(TIERS.map((t) => { const x = route(t); return [t, x ? { provider: x.provider, model: x.models[0] } : null]; }));
  return { enabled: !!r, edition: edition(), provider: r?.provider ?? "none", model: r?.models[0] ?? "—", fallbacks: r?.models.slice(1) ?? [], tiers };
}
export function modelChain(tier: Tier): string[] { return route(tier)?.models ?? []; }

export function getModel(tier: Tier): LanguageModel {
  const r = route(tier);
  if (!r) throw new Error("AI provider not configured");
  const [primary, ...rest] = r.models;
  if (r.provider === "anthropic") return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(primary!);
  if (r.provider === "gemini") return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(primary!);
  return createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, appName: "Meridian ERP" }).chat(primary!, { models: rest });
}
