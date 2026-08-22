import { NextResponse } from "next/server";
import { chatText } from "@/lib/openrouter";

const TYPES = [
  { id: 0, name: "GUARANTEED", stake: "0.1", blurb: "Pay 0.1 MON. Contract returns 0.14 MON." },
  { id: 1, name: "RISKY", stake: "0.2", blurb: "Pay 0.2 MON. ~60% chance the contract pays 0.6 MON." },
  { id: 2, name: "INFO", stake: "0.05", blurb: "Pay 0.05 MON. Stake stays in the house. I hint the next challenge." },
] as const;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    balanceMon?: number;
    last?: "accept" | "reject" | null;
    round?: number;
  };
  const deal = TYPES[(body.round ?? 1) % 3];

  const fallback =
    body.last === "reject"
      ? `You refused me. Balance ${body.balanceMon?.toFixed(2) ?? "?"} MON. Fine. ${deal.blurb}`
      : `You've got ${body.balanceMon?.toFixed(2) ?? "?"} MON. ${deal.blurb} Sign it or walk.`;

  const llm = await chatText(
    "You are the Inferno Devil. Manipulative, funny, short. 2-4 sentences. Never invent a transaction. The deal economics are fixed; sell the deal, don't change numbers.",
    `Player balance MON: ${body.balanceMon}. Last action: ${body.last}. Round: ${body.round}. Deal: ${deal.blurb}`,
  );

  return NextResponse.json({
    line: (llm ?? fallback).slice(0, 400),
    deal,
  });
}
