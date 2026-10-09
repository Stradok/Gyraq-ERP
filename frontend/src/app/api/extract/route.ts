import { generateText } from "ai";
import { InvoiceExtraction } from "@/lib/ai/extract";
import { aiEnabled, getModel, modelChain } from "@/lib/ai/provider";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
const MAX_BYTES = 4_000_000;
const OK_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  if (!aiEnabled()) return Response.json({ error: "AI provider not configured" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const win = (hits.get(ip) ?? []).filter((t) => Date.now() - t < 60_000); win.push(Date.now()); hits.set(ip, win);
  if (win.length > 4) return Response.json({ error: "Too many uploads. Please wait a minute." }, { status: 429 });
  const body = (await req.json()) as { mediaType?: string; data?: string };
  if (!body.data || !body.mediaType || !OK_TYPES.has(body.mediaType)) return Response.json({ error: "Upload a PNG, JPG, WebP or PDF invoice." }, { status: 400 });
  const bytes = Buffer.from(body.data, "base64");
  if (bytes.length > MAX_BYTES) return Response.json({ error: "File is larger than 4 MB." }, { status: 413 });
  // magic-byte check: never trust the declared type
  const sig = bytes.subarray(0, 4).toString("hex");
  const real = sig.startsWith("89504e47") ? "image/png" : sig.startsWith("ffd8ff") ? "image/jpeg" : sig.startsWith("52494646") ? "image/webp" : sig.startsWith("25504446") ? "application/pdf" : null;
  if (!real) return Response.json({ error: "That file doesn't look like an invoice image or PDF." }, { status: 400 });
  try {
    const content = real === "application/pdf" ? ({ type: "file", data: bytes, mediaType: real } as const) : ({ type: "image", image: bytes, mediaType: real } as const);
    // Free vision models don't all support json_schema output, so ask for JSON, validate with Zod, and repair once.
    const schemaHint = JSON.stringify({ supplierName: "string", supplierNtn: "string or null", invoiceNo: "string", invoiceDate: "YYYY-MM-DD", poReference: "string or null", lines: [{ description: "string", qty: 0, unitPrice: 0, amount: 0 }], subtotal: 0, salesTax: 0, total: 0 });
    const ask = (extra: string) => generateText({ model: getModel("vision"), temperature: 0, timeout: 50_000, messages: [{ role: "user", content: [{ type: "text", text: `Extract this supplier invoice. Reply with ONLY one JSON object, no markdown, in exactly this shape: ${schemaHint}. Numbers are plain numbers without currency symbols or thousands separators. Dates are YYYY-MM-DD. Use null when a field is not printed. Do not guess.${extra}` }, content] }] });
    const parse = (text: string) => { const m = text.match(/\{[\s\S]*\}/); if (!m) return null; try { return InvoiceExtraction.safeParse(JSON.parse(m[0])); } catch { return null; } };
    let res = await ask("");
    let parsed = parse(res.text);
    if (!parsed?.success) { res = await ask(` Your previous answer was invalid${parsed && !parsed.success ? `: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".") + " " + i.message).join("; ")}` : ""}. Return valid JSON only.`); parsed = parse(res.text); }
    if (!parsed?.success) return Response.json({ error: "We couldn't read that document reliably. Try a clearer image, or enter the bill manually." }, { status: 422 });
    const output = parsed.data;
    return Response.json({ extraction: output, model: modelChain("vision")[0] });
  } catch (e) {
    return Response.json({ error: "We couldn't read that document. Try a clearer image, or enter the bill manually.", detail: e instanceof Error ? e.message.slice(0, 160) : "" }, { status: 502 });
  }
}
