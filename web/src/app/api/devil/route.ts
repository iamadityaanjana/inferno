import { NextResponse } from "next/server";
import { fail, readBody } from "@/lib/http";
import { formatDevilHistory, rememberDevil, type DevilRound, type DevilTurn } from "@/lib/memory";
import { chatText } from "@/lib/openrouter";

const TYPES = [
  { id: 0, name: "GUARANTEED", stake: "0.1", blurb: "Pay 0.1 MON. Contract returns 0.14 MON." },
  { id: 1, name: "RISKY", stake: "0.2", blurb: "Pay 0.2 MON. ~60% chance the contract pays 0.6 MON." },
  { id: 2, name: "INFO", stake: "0.05", blurb: "Pay 0.05 MON. Stake stays in the house. I hint the next challenge." },
] as const;

export async function POST(req: Request) {
  try {
    const body = await readBody<{
      sessionId?: string;
      balanceMon?: number;
      last?: "accept" | "reject" | null;
      round?: number;
      lives?: number;
      turns?: DevilTurn[];
      rounds?: DevilRound[];
    }>(req);

    const deal = TYPES[(body.round ?? 1) % 3];
    const session = rememberDevil(body.sessionId || "anon", {
      round: body.round,
      lives: body.lives,
      last: body.last ?? null,
      deal,
      turns: body.turns,
      rounds: body.rounds,
    });

    const fallback =
      body.last === "reject"
        ? `You refused me. Balance ${body.balanceMon?.toFixed(2) ?? "?"} MON. Fine. ${deal.blurb}`
        : `You've got ${body.balanceMon?.toFixed(2) ?? "?"} MON. ${deal.blurb} Sign it or walk.`;

    const llm = await chatText(
      "You are the Inferno Devil. Manipulative, funny, short. 2-4 sentences. Never invent a transaction. The deal economics are fixed; sell the deal, don't change numbers. Use the game log so you remember what they accepted, rejected, won, or lost.",
      `${formatDevilHistory(session)}\n\nPlayer balance MON: ${body.balanceMon}. Last action: ${body.last}. Round: ${body.round}. Lives: ${body.lives}.\nSell this deal: ${deal.blurb}`,
      [],
      220,
    );

    const line = (llm ?? fallback).slice(0, 400);
    rememberDevil(session.id, {
      ...session,
      line,
      deal,
      turns: [...session.turns, { role: "devil", content: line, at: Date.now() }],
    });

    return NextResponse.json({
      line,
      deal,
    });
  } catch (e) {
    return fail(e, "Devil is silent");
  }
}
