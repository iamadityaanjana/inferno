import { NextResponse } from "next/server";
import { fail, readBody } from "@/lib/http";
import { getListing } from "@/lib/listings";
import { formatChatHistory, rememberChat, type ChatTurn } from "@/lib/memory";
import { chatText } from "@/lib/openrouter";
import { assertPaid } from "@/lib/server-chain";

const PROMPTS: Record<number, string> = {
  1: "You are a web research agent. Give 5 tight bullets of current, useful facts for the task. Use prior conversation so you do not repeat yourself. If you lack live search, say so and reason from known public info. Max 140 words.",
  2: "You are a Monad DeFi analyst. Name 2-3 realistic opportunity types on Monad (DEX, lending, LST) and what to check. Stay consistent with earlier answers. No financial advice. Max 140 words.",
  3: "You are a news agent. Summarize the most relevant recent themes for the task, given the conversation. Max 120 words.",
  4: "You are a risk agent. Score 1-10 and list 3 concrete risks. Reference earlier context if the user is following up. Max 100 words.",
  5: "You are a general researcher. Give a concise brief that builds on the prior conversation. Max 120 words.",
};

async function callEndpoint(endpoint: string, payload: unknown) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12_000),
  });
  const data = (await res.json().catch(() => null)) as { result?: string } | null;
  if (!res.ok || !data?.result) throw new Error("Partner agent did not return a result");
  return data.result;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const agentId = Number(id);
    const body = await readBody<{
      txHash?: string;
      task?: string;
      sessionId?: string;
      history?: ChatTurn[];
      capabilities?: string;
    }>(req);
    if (!body.txHash?.startsWith("0x") || body.txHash.length !== 66) {
      return NextResponse.json({ error: "real txHash required" }, { status: 400 });
    }
    if (!agentId || agentId < 1) {
      return NextResponse.json({ error: "bad agent" }, { status: 400 });
    }

    try {
      await assertPaid(body.txHash as `0x${string}`, agentId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "unpaid" }, { status: 402 });
    }

    const task = body.task ?? "Research Monad";
    const history = rememberChat(body.sessionId || "anon", body.history ?? []);
    const listing = await getListing(agentId);

    if (listing?.endpoint) {
      try {
        const result = await callEndpoint(listing.endpoint, {
          agentId,
          task,
          txHash: body.txHash,
          history,
        });
        return NextResponse.json({ agentId, txHash: body.txHash, result });
      } catch {
        // fall through to local run so the paid hire still answers
      }
    }

    const system =
      PROMPTS[agentId] ??
      `You are ${listing?.name ?? `agent ${agentId}`}. ${body.capabilities || listing?.name || "Help with the task."} Be concise. Max 140 words.`;

    const llm = await chatText(
      system,
      `Conversation so far:\n${formatChatHistory(history)}\n\nCurrent task: ${task}`,
      [],
      280,
    );
    const result = llm ?? `Hire confirmed. Agent ${agentId} has no live model right now.`;

    return NextResponse.json({ agentId, txHash: body.txHash, result });
  } catch (e) {
    return fail(e, "Agent run failed");
  }
}
