import { NextResponse } from "next/server";
import { chatText } from "@/lib/openrouter";

export async function POST(req: Request) {
  const body = (await req.json()) as { task?: string; results?: { agentId: number; result: string; txHash: string }[] };
  if (!body.task || !body.results?.length) {
    return NextResponse.json({ error: "task and results required" }, { status: 400 });
  }

  const packed = body.results
    .map((r) => `Agent ${r.agentId} (tx ${r.txHash}):\n${r.result}`)
    .join("\n\n");

  const llm = await chatText(
    "Synthesize a final answer for a user from hired-agent notes. Be direct. Mention this is not financial advice. Max 180 words.",
    `Task: ${body.task}\n\n${packed}`,
  );

  const answer =
    llm ??
    `Hired ${body.results.length} agents on-chain.\n\n${packed}\n\nAdd OPENROUTER_API_KEY for a tighter synthesis. Not financial advice.`;

  return NextResponse.json({ answer });
}
