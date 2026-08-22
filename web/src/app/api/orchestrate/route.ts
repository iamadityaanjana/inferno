import { NextResponse } from "next/server";
import { fail, readBody } from "@/lib/http";
import { formatChatHistory, rememberChat, type ChatTurn } from "@/lib/memory";
import { chatJson } from "@/lib/openrouter";

export type PlanStep = {
  agentId: number;
  reason: string;
  priceWei: string;
};

export type CatalogAgent = {
  id: number;
  name: string;
  capabilities: string;
  priceWei: string;
};

function fallback(task: string, catalog: CatalogAgent[]): PlanStep[] {
  if (!catalog.length) return [];
  const lower = task.toLowerCase();
  const scored = catalog
    .map((agent) => {
      const hay = `${agent.name} ${agent.capabilities}`.toLowerCase();
      let score = 1;
      if (lower.includes("defi") && hay.includes("defi")) score += 3;
      if (lower.includes("risk") && hay.includes("risk")) score += 3;
      if (lower.includes("news") && hay.includes("news")) score += 2;
      if (hay.includes("research")) score += 1;
      return { agent, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map(({ agent }) => ({
    agentId: agent.id,
    reason: agent.capabilities,
    priceWei: agent.priceWei,
  }));
}

export async function POST(req: Request) {
  try {
    const body = await readBody<{ task?: string; sessionId?: string; history?: ChatTurn[]; agents?: CatalogAgent[] }>(
      req,
    );
    const task = body.task?.trim();
    if (!task) return NextResponse.json({ error: "task required" }, { status: 400 });

    const catalog = (body.agents ?? []).filter((a) => a.id > 0 && a.name && a.priceWei);
    const history = rememberChat(body.sessionId || "anon", body.history ?? []);
    const transcript = formatChatHistory(history);
    const roster = catalog.map((a) => `${a.id} ${a.name}: ${a.capabilities}`).join("\n");

    const raw = await chatJson(
      `You plan hires for an on-chain agent marketplace. Return JSON only: {"steps":[{"agentId":1,"reason":"..."}]}.
Valid agents:\n${roster || "none"}
Pick 2 or 3 agents max from that list only. Use the conversation so you do not re-hire for a question already answered unless the user asks to go deeper. Never invent prices or transactions.`,
      `Conversation so far:\n${transcript}\n\nCurrent task: ${task}`,
    );

    let steps = fallback(task, catalog);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { steps?: { agentId: number; reason: string }[] };
        const byId = new Map(catalog.map((a) => [a.id, a]));
        const cleaned = (parsed.steps ?? [])
          .filter((s) => byId.has(s.agentId))
          .slice(0, 3)
          .map((s) => ({
            agentId: s.agentId,
            reason: s.reason,
            priceWei: byId.get(s.agentId)!.priceWei,
          }));
        if (cleaned.length) steps = cleaned;
      } catch {
        // keep fallback
      }
    }

    return NextResponse.json({ steps, llm: Boolean(raw) });
  } catch (e) {
    return fail(e, "Could not plan hires");
  }
}
