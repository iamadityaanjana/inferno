import { NextResponse } from "next/server";
import { chatJson } from "@/lib/openrouter";

export type PlanStep = {
  agentId: number;
  reason: string;
  priceWei: string;
};

const PRICES: Record<number, string> = {
  1: "20000000000000000",
  2: "40000000000000000",
  3: "30000000000000000",
  4: "30000000000000000",
  5: "20000000000000000",
};

const NAMES: Record<number, string> = {
  1: "Web Research",
  2: "DeFi Agent",
  3: "News Agent",
  4: "Risk Agent",
  5: "General Research",
};

function fallback(task: string): PlanStep[] {
  const lower = task.toLowerCase();
  const steps: PlanStep[] = [
    { agentId: 1, reason: "Need current public information", priceWei: PRICES[1] },
  ];
  if (lower.includes("defi") || lower.includes("monad") || lower.includes("yield")) {
    steps.push({ agentId: 2, reason: "Need Monad DeFi analysis", priceWei: PRICES[2] });
    steps.push({ agentId: 4, reason: "Need a risk score before recommending", priceWei: PRICES[4] });
  } else {
    steps.push({ agentId: 5, reason: "Need a general synthesis pass", priceWei: PRICES[5] });
  }
  return steps.slice(0, 3);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { task?: string };
  const task = body.task?.trim();
  if (!task) return NextResponse.json({ error: "task required" }, { status: 400 });

  const raw = await chatJson(
    `You plan hires for an on-chain agent marketplace. Return JSON only: {"steps":[{"agentId":1,"reason":"..."}]}.
Valid agentId: 1 Web Research, 2 DeFi, 3 News, 4 Risk, 5 General.
Pick 2 or 3 agents max. Never invent prices or transactions.`,
    task,
  );

  let steps = fallback(task);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { steps?: { agentId: number; reason: string }[] };
      const cleaned = (parsed.steps ?? [])
        .filter((s) => s.agentId >= 1 && s.agentId <= 5)
        .slice(0, 3)
        .map((s) => ({
          agentId: s.agentId,
          reason: s.reason,
          priceWei: PRICES[s.agentId],
        }));
      if (cleaned.length) steps = cleaned;
    } catch {
      // keep fallback
    }
  }

  return NextResponse.json({
    steps,
    names: NAMES,
    llm: Boolean(raw),
  });
}
