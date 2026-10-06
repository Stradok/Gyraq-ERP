import { aiInfo } from "@/lib/ai/provider";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(aiInfo()); }
