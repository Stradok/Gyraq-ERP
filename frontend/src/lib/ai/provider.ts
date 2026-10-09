// Provider abstraction (docs/plan/06 §3). Business code asks for a tier; this file is the only place that knows
// about OpenRouter / Anthropic / Gemini. Switch with AI_PROVIDER – no other code changes.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export type Tier = "fast" | "reasoning" | "vision";
const list = (v: string | undefined, d: string[]) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : d);

// Free OpenRouter models change often (qwen3.8-27b:free was removed in Oct 2026); override with AI_MODEL_REASONING / _FAST / _VISION.
const OR_DEFAULTS: Record<Tier, string[]> = {
  reasoning: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free"],
  fast: ["google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"],
  vision: ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"],
};

export function aiEnabled(): boolean {
  const p = (process.env.AI_PROVIDER ?? "openrouter").toLowerCase();
  if (p === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
  if (p === "gemini") return !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return !!process.env.OPENROUTER_API_KEY;
}

export function aiInfo() {
  const provider = (process.env.AI_PROVIDER ?? "openrouter").toLowerCase();
  const chain = modelChain("reasoning");
  return { enabled: aiEnabled(), provider, model: chain[0] ?? "—", fallbacks: chain.slice(1) };
}

export function modelChain(tier: Tier): string[] {
  const p = (process.env.AI_PROVIDER ?? "openrouter").toLowerCase();
  if (p === "anthropic") return list(process.env[`AI_MODEL_${tier.toUpperCase()}`], [tier === "fast" ? "claude-haiku-4-5-20251001" : "claude-sonnet-5-5"]);
  if (p === "gemini") return list(process.env[`AI_MODEL_${tier.toUpperCase()}`], ["gemini-2.5-flash"]);
  return list(process.env[`AI_MODEL_${tier.toUpperCase()}`] ?? (tier === "reasoning" ? process.env.AI_MODEL : undefined), OR_DEFAULTS[tier]);
}

export function getModel(tier: Tier): LanguageModel {
  const p = (process.env.AI_PROVIDER ?? "openrouter").toLowerCase();
  const [primary, ...rest] = modelChain(tier);
  if (p === "anthropic") return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(primary!);
  if (p === "gemini") return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })(primary!);
  const or = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, appName: "Meridian ERP demo" });
  return or.chat(primary!, { models: rest });
}
