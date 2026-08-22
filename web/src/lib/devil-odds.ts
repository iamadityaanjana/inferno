/**
 * The Devil Mode odds table, mirroring DevilEscrow.termsFor exactly.
 *
 * This is the only place the economics are written down on the frontend. The
 * planning prompt, the deal blurbs and the UI previews all derive from it,
 * because the failure mode when they drift is a player being shown a payout the
 * escrow will not honour — and the escrow always wins that argument.
 *
 * Every line is deliberately below 1x expected value. LONGSHOT is the comeback:
 * it almost always loses, and pays 9x when it lands.
 */
export type DealKind = {
  id: 0 | 1 | 2 | 3;
  name: string;
  /** Chance of winning as a percentage. */
  winPct: number;
  /** Payout on a win as a multiple of the stake. 0 means the stake is gone. */
  payMult: number;
  /** True when the player picks a number that decides the outcome. */
  needsGuess: boolean;
  /** How many values that pick ranges over, 0-indexed. */
  guessSides: number;
  /** An INFO-style deal whose product is the leak rather than the money. */
  leaks: boolean;
  /** One line of plain English, shown to the player. */
  summary: string;
  /** How the model is briefed on this deal type. */
  rule: string;
};

export const DEAL_KINDS: readonly DealKind[] = [
  {
    id: 0,
    name: "SAFE",
    winPct: 85,
    payMult: 1.1,
    needsGuess: false,
    guessSides: 0,
    leaks: false,
    summary: "85% chance of 1.1x. The catch is the 15% that takes everything.",
    rule:
      "85% chance the contract pays 1.1x the stake, 15% chance it pays nothing. " +
      "Expected value 0.935x. The bait is that it feels safe; the catch is a small win against a total loss.",
  },
  {
    id: 1,
    name: "GAMBLE",
    winPct: 45,
    payMult: 2,
    needsGuess: false,
    guessSides: 0,
    leaks: false,
    summary: "45% chance of 2x. A coin flip tilted against you.",
    rule:
      "45% chance the contract pays 2x the stake, 55% chance it pays nothing. " +
      "Expected value 0.90x. Looks like a coin flip, is not one.",
  },
  {
    id: 2,
    name: "LONGSHOT",
    winPct: 10,
    payMult: 9,
    needsGuess: true,
    guessSides: 10,
    leaks: false,
    summary: "Pick a digit 0-9. Match it and the contract pays 9x. One in ten.",
    rule:
      "the player picks a digit 0-9 and wins only if the settlement block matches it — a one-in-ten shot paying 9x. " +
      "Expected value 0.90x. This is the comeback deal: it is how a losing run gets undone, so dangle it when they are behind.",
  },
  {
    id: 3,
    name: "PACT",
    winPct: 50,
    payMult: 1,
    needsGuess: false,
    guessSides: 0,
    leaks: true,
    summary: "Always leaks the next three rounds. Coin flip on getting your stake back.",
    rule:
      "the player always learns the terms of the next three rounds, and a 50% roll decides whether the stake comes " +
      "back at 1x or stays with the house. Expected value 0.50x, your most profitable line — but it is the only deal " +
      "that gives them information, so it is also the one that keeps them playing.",
  },
] as const;

export const SAFE = 0;
export const GAMBLE = 1;
export const LONGSHOT = 2;
export const PACT = 3;

export function kindById(id: number): DealKind {
  return DEAL_KINDS[id] ?? DEAL_KINDS[0];
}

/** Trims trailing zeros so a payout reads "0.06 MON", not "0.060 MON". */
export function mon(n: number) {
  return String(Number(n.toFixed(4)));
}

/** What a win pays on this stake, computed the way the contract computes it. */
export function payoutOn(id: number, stake: string | number) {
  return mon(Number(stake) * kindById(id).payMult);
}

/** The player-facing terms of a specific deal. Never written by an LLM. */
export function describeDeal(id: number, stake: string) {
  const kind = kindById(id);
  const win = payoutOn(id, stake);
  if (kind.leaks) {
    return (
      `Pay ${stake} MON and the next three rounds' terms are yours either way. ` +
      `${kind.winPct}% chance the contract also returns your ${win} MON.`
    );
  }
  if (kind.needsGuess) {
    return `Pay ${stake} MON and pick a digit. Match it — a 1-in-${kind.guessSides} shot — and the contract pays ${win} MON.`;
  }
  return `Pay ${stake} MON. ${kind.winPct}% chance the contract pays ${win} MON, otherwise the house keeps it.`;
}

/** The briefing handed to the planning model. */
export const ECONOMICS = DEAL_KINDS.map((k) => `kind ${k.id} (${k.name}): ${k.rule}`).join("\n");
