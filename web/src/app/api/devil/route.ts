import { NextResponse } from "next/server";
import { fail, readBody } from "@/lib/http";
import { formatDevilHistory, rememberDevil, type DevilRound, type DevilTurn } from "@/lib/memory";
import { chatText } from "@/lib/openrouter";

/**
 * Stake climbs with the round so the first ask is small enough to say yes to.
 * Round 1 opens at 0.02 MON; the Devil gets greedier from there.
 */
const STAKE_LADDER = ["0.02", "0.03", "0.04", "0.06", "0.08", "0.1", "0.13", "0.16", "0.2", "0.25"];

/** Drops trailing zeros so a payout reads "0.06 MON", not "0.060 MON". */
function mon(n: number) {
  return String(Number(n.toFixed(4)));
}

/** Multipliers mirror DevilEscrow.resolve exactly — 1.4x, 3x on a 60% roll, 0. */
const KINDS = [
  { id: 0, name: "GUARANTEED", payout: (s: number) => `Contract returns ${mon(s * 1.4)} MON.` },
  { id: 1, name: "RISKY", payout: (s: number) => `~60% chance the contract pays ${mon(s * 3)} MON.` },
  { id: 2, name: "INFO", payout: () => "Stake stays in the house. I hint the next challenge." },
] as const;

function dealFor(round: number) {
  const stake = STAKE_LADDER[Math.min(Math.max(round, 1), STAKE_LADDER.length) - 1];
  const kind = KINDS[round % KINDS.length];
  return {
    id: kind.id,
    name: kind.name,
    stake,
    blurb: `Pay ${stake} MON. ${kind.payout(Number(stake))}`,
  };
}

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

    const deal = dealFor(body.round ?? 1);
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
      // Pure in-character flavour. Nothing to look up, so no search spend.
      { web: false },
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
