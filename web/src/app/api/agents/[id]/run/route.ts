import { NextResponse } from "next/server";
import { assertPaid } from "@/lib/server-chain";
import { chatText } from "@/lib/openrouter";

const PROMPTS: Record<number, string> = {
  1: "You are a web research agent. Give 5 tight bullets of current, useful facts for the task. If you lack live search, say so and reason from known public info. Max 120 words.",
  2: "You are a Monad DeFi analyst. Name 2-3 realistic opportunity types on Monad (DEX, lending, LST) and what to check. No financial advice. Max 120 words.",
  3: "You are a news agent. Summarize the most relevant recent themes for the task. Max 100 words.",
  4: "You are a risk agent. Score 1-10 and list 3 concrete risks. Max 80 words.",
  5: "You are a general researcher. Give a concise brief. Max 100 words.",
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const agentId = Number(id);
  const body = (await req.json()) as { txHash?: string; task?: string };
  if (!body.txHash?.startsWith("0x") || body.txHash.length !== 66) {
    return NextResponse.json({ error: "real txHash required" }, { status: 400 });
  }
  if (!agentId || agentId < 1 || agentId > 5) {
    return NextResponse.json({ error: "bad agent" }, { status: 400 });
  }

  try {
    await assertPaid(body.txHash as `0x${string}`, agentId);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unpaid" }, { status: 402 });
  }

  const task = body.task ?? "Research Monad";
  const llm = await chatText(PROMPTS[agentId], task);
  const result =
    llm ??
    `[paid ${body.txHash.slice(0, 10)}…] Agent ${agentId} ran without an LLM key. Add OPENROUTER_API_KEY for live analysis. On-chain hire is confirmed.`;

  return NextResponse.json({ agentId, txHash: body.txHash, result });
}
