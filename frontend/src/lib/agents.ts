// Catalog for the Agent Center. "Runnable" agents work today from the ledger, with or without an AI model (the model only
// improves wording). Others are listed honestly as not built yet, with the tier that will include them (docs/PRICE-PLAN.md).
export type Tier = "Basic" | "Standard" | "Professional" | "Voice add-on";
export interface AgentDef { id: string; name: string; does: string; tier: Tier; runnable: boolean; needsAi?: boolean; status: "live" | "planned"; tools?: string }

export const AGENTS: AgentDef[] = [
  { id: "assistant", name: "Business assistant", does: "Answers questions about your data, opens screens, and prepares actions you confirm.", tier: "Basic", runnable: false, status: "live", tools: "Chat in the Assistant button or AI Command Center" },
  { id: "bill_reader", name: "Bill reader", does: "Reads a photo or PDF of a supplier bill into a draft bill and flags mismatches.", tier: "Standard", runnable: false, needsAi: true, status: "live", tools: "Purchasing → Supplier bills → New bill → Extract" },
  { id: "collections", name: "Collections agent", does: "Finds customers overdue by 30+ days and drafts a polite follow-up for each. You approve before anything is sent.", tier: "Basic", runnable: true, status: "live" },
  { id: "replenishment", name: "Replenishment agent", does: "Finds products that will run out before the supplier can deliver and proposes purchase orders.", tier: "Basic", runnable: true, status: "live" },
  { id: "watcher", name: "Anomaly watcher", does: "Scans for risks: collections, stock-outs, supplier price jumps, duplicate bills.", tier: "Basic", runnable: true, status: "live" },
  { id: "scheduled", name: "Scheduled autonomous agents", does: "Runs the agents above on a timetable, reasons over your data and queues proposals for approval, without you opening the app.", tier: "Professional", runnable: false, status: "planned" },
  { id: "voice", name: "Voice agent", does: "Talk to the ERP, or take orders by phone, in English and Urdu, over LiveKit.", tier: "Voice add-on", runnable: false, status: "planned" },
];
