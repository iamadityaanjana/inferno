import { NextResponse } from "next/server";
import { formatEther } from "viem";
import { devilEscrowAbi } from "@/lib/abi";
import { DEVIL_ESCROW } from "@/lib/contracts";
import {
  DEAL_KINDS,
  ECONOMICS,
  GAMBLE,
  LONGSHOT,
  PACT,
  SAFE,
  describeDeal,
  kindById,
} from "@/lib/devil-odds";
import { fail, readBody } from "@/lib/http";
import {
  formatDevilHistory,
  rememberDevil,
  type DevilPlanRound,
  type DevilRound,
  type DevilTurn,
} from "@/lib/memory";
import { chatJson, chatText } from "@/lib/openrouter";
import { publicClient } from "@/lib/server-chain";

const ROUNDS = 10;
const MIN_STAKE = 0.01;
/** Fallback ceiling, only used when the house capacity read fails. */
const MAX_STAKE = 0.1;

/**
 * The largest stake per deal type the house can actually cover right now.
 *
 * A LONGSHOT owes 9x on a hit, so the escrow refuses a stake it could not pay
 * in full. Reading the real ceiling means we never compose a run whose later
 * rounds revert on accept — the alternative is offering a deal and discovering
 * at signing time that it was never available.
 */
async function houseCeilings(): Promise<number[]> {
  try {
    const caps = await Promise.all(
      DEAL_KINDS.map((k) =>
        publicClient.readContract({
          address: DEVIL_ESCROW,
          abi: devilEscrowAbi,
          functionName: "maxStakeFor",
          args: [k.id],
        }),
      ),
    );
    return caps.map((wei) => Number(formatEther(wei)));
  } catch {
    return DEAL_KINDS.map(() => MAX_STAKE);
  }
}

/** Room for the biggest ask on the ladder, leaving the house a little headroom. */
function ceilingFor(caps: number[], kind: number) {
  const cap = caps[kind] ?? MAX_STAKE;
  return Math.max(MIN_STAKE, Math.min(MAX_STAKE, cap * 0.6));
}

function clampStake(raw: unknown, fallback: number, ceiling: number) {
  const n = typeof raw === "number" ? raw : Number(raw);
  const safe = Number.isFinite(n) && n > 0 ? n : fallback;
  return String(Number(Math.min(ceiling, Math.max(MIN_STAKE, safe)).toFixed(2)));
}

/**
 * Titles are flavour, so they carry no digits or markup — a rung named
 * "pays 500x" sitting beside a server-computed payout reads as a promise.
 */
function cleanTitle(raw: unknown, round: number) {
  const text = typeof raw === "string" ? raw.replace(/[^A-Za-z' -]/g, " ").replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 40).trim() : `Round ${round}`;
}

function clampKind(raw: unknown): DevilPlanRound["kind"] {
  const n = Number(raw);
  return n === SAFE || n === GAMBLE || n === LONGSHOT || n === PACT ? n : GAMBLE;
}

/**
 * A run with no LLM behind it. Still random, so the game never falls back to a
 * fixed script when the model is unavailable or its output is unusable.
 */
function randomPlan(caps: number[]): DevilPlanRound[] {
  const mix = composition();
  return mix.order.map((kind, i) => {
    const round = i + 1;
    const drift = 0.01 + (round / ROUNDS) * 0.06 + Math.random() * 0.02;
    return { round, kind, stake: clampStake(drift, 0.02, ceilingFor(caps, kind)), title: `Round ${round}` };
  });
}

/**
 * Rolls how many of each deal type a run contains, and a shuffled order.
 *
 * Variety is dealt here rather than asked for, because a model given the same
 * brief converges on the same run — four sampled runs came back as the same
 * repeating skeleton before this existed. The model still places, paces and
 * names the rungs; it just cannot decide that every run looks alike.
 */
function composition() {
  const pacts = 1 + Math.floor(Math.random() * 2); // 1-2 toll booths.
  const longshots = 1 + Math.floor(Math.random() * 3); // 1-3 comeback shots.
  const gambles = 2 + Math.floor(Math.random() * 3); // 2-4 coin flips.
  const counts = [ROUNDS - pacts - longshots - gambles, gambles, longshots, pacts];

  const order: DevilPlanRound["kind"][] = [];
  counts.forEach((n, kind) => {
    for (let i = 0; i < n; i++) order.push(kind as DevilPlanRound["kind"]);
  });
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { counts, order, opening: order[0] };
}

/**
 * Asks the model to compose a run, briefed on the real economics, then rewrites
 * every number it returned.
 *
 * The briefing is what makes a run well-paced: a model that knows a PACT is a
 * toll and a LONGSHOT is the comeback places them deliberately. The rewrite
 * is what makes it safe: the model still has to do arithmetic to reach a payout,
 * and a slipped digit here is a promise of money the escrow will refuse to pay,
 * with the player absorbing the difference. So we teach it the maths and then
 * decline to trust it — the shown figures always come from KINDS.
 */
async function buildPlan(balanceMon?: number, lives?: number): Promise<DevilPlanRound[]> {
  const caps = await houseCeilings();
  const purse = typeof balanceMon === "number" && balanceMon > 0 ? balanceMon : null;
  const mix = composition();
  const raw = await chatJson(
    "You are the Inferno Devil, designing a gauntlet you intend to profit from.\n\n" +
      `The escrow contract settles every deal and its maths is fixed and unchangeable:\n${ECONOMICS}\n\n` +
      "Every deal returns less than the stake on average — that is the point. The player is meant to grind down " +
      "and be pulled back by the occasional longshot.\n\n" +
      `Reply with JSON only: {"rounds":[{"round":1,"kind":0,"stake":0.02,"title":"short evocative name"}]}, ` +
      `exactly ${ROUNDS} entries.\n` +
      `stake is a number in MON between ${MIN_STAKE} and ${ceilingFor(caps, LONGSHOT).toFixed(2)}, broadly escalating ` +
      "so the opening ask is easy to say yes to and the last one hurts.\n" +
      "Design deliberately: place a longshot right after a run of losses so it reads as a way back, and put a pact " +
      "where they most need to know what is coming. Avoid any repeating cycle — the shape should look composed.\n" +
      "Titles are at most four words, menacing, and contain no numbers or payout claims — the contract states the " +
      "terms, you only name the rung.",
    `Design a fresh ${ROUNDS}-round run using exactly this mix, in an order of your choosing: ` +
      DEAL_KINDS.map((k) => `${mix.counts[k.id]} of kind ${k.id}`).join(", ") +
      `. Round 1 must be kind ${mix.opening}. ` +
      (purse ? `The player is carrying about ${purse.toFixed(2)} MON, so keep it affordable enough to keep saying yes. ` : "") +
      (typeof lives === "number" ? `They have ${lives} lives. ` : "") +
      `Seed ${Math.random().toString(36).slice(2, 10)}.`,
    [],
    900,
    // Planning is a creative call, not an extraction one; the default 0.4 makes
    // every run the same run.
    1,
  );
  if (!raw) return randomPlan(caps);

  try {
    const parsed = JSON.parse(raw) as { rounds?: unknown[] };
    const list = Array.isArray(parsed.rounds) ? parsed.rounds : [];
    if (list.length < ROUNDS) return randomPlan(caps);

    const spare = randomPlan(caps);
    let corrected = 0;
    const plan = list.slice(0, ROUNDS).map((entry, i) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const kind = clampKind(row.kind);
      const stake = clampStake(row.stake, Number(spare[i].stake), ceilingFor(caps, kind));
      if (kind !== Number(row.kind) || stake !== String(Number(row.stake))) corrected += 1;
      return { round: i + 1, kind, stake, title: cleanTitle(row.title, i + 1) };
    });

    // Worth knowing: a briefed model needing frequent correction means the
    // prompt has drifted from the bounds, not that the guard is redundant.
    if (corrected > 0) {
      console.warn(`[devil] rewrote ${corrected}/${ROUNDS} generated rungs to fit contract bounds`);
    }

    // A run that is all one kind is not a run. Fall back rather than ship it.
    const kinds = new Set(plan.map((p) => p.kind));
    return kinds.size >= 2 ? plan : randomPlan(caps);
  } catch {
    return randomPlan(caps);
  }
}

function dealFrom(rung: DevilPlanRound) {
  const kind = kindById(rung.kind);
  return {
    id: kind.id,
    name: kind.name,
    stake: rung.stake,
    title: rung.title,
    blurb: describeDeal(kind.id, rung.stake),
  };
}

/** Keeps a client-supplied plan usable without trusting a single field of it. */
async function adoptPlan(raw: unknown): Promise<DevilPlanRound[] | null> {
  if (!Array.isArray(raw) || raw.length !== ROUNDS) return null;
  const caps = await houseCeilings();
  const spare = randomPlan(caps);
  return raw.map((entry, i) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const kind = clampKind(row.kind);
    return {
      round: i + 1,
      kind,
      // Re-clamped against live capacity: a plan saved when the house was fat
      // must not keep offering stakes it can no longer cover.
      stake: clampStake(row.stake, Number(spare[i].stake), ceilingFor(caps, kind)),
      title: cleanTitle(row.title, i + 1),
    };
  });
}

function rungAt(plan: DevilPlanRound[], round: number) {
  return plan[Math.min(Math.max(round, 1), ROUNDS) - 1];
}

export async function POST(req: Request) {
  try {
    const body = await readBody<{
      sessionId?: string;
      balanceMon?: number;
      last?: "accept" | "reject" | null;
      round?: number;
      lives?: number;
      mode?: "deal" | "hint";
      plan?: unknown;
      turns?: DevilTurn[];
      rounds?: DevilRound[];
    }>(req);

    const round = body.round ?? 1;
    // The run is composed once and then carried by the client, because server
    // memory does not survive between serverless invocations — and a leak that
    // disagreed with the deal it later dealt would be worse than no leak.
    const plan = (await adoptPlan(body.plan)) ?? (await buildPlan(body.balanceMon, body.lives));

    // A PACT has been paid for, so it must hand over something the player
    // cannot already see. The next round's terms are printed on the deal itself,
    // so the only real product is the road ahead: the next three rungs of the
    // ladder, which is what tells them whether to keep climbing.
    if (body.mode === "hint") {
      const rounds = [round + 1, round + 2, round + 3]
        .filter((r) => r <= ROUNDS)
        .map((r) => {
          const d = dealFrom(rungAt(plan, r));
          return { round: r, name: d.name, stake: d.stake, blurb: `${d.title} — ${d.blurb}` };
        });
      const hint = { rounds };
      // The upcoming deal ships with the leak so the player is not left waiting
      // on a second round-trip before they can act on what they just bought.
      const deal = dealFrom(rungAt(plan, round + 1));

      const session = rememberDevil(body.sessionId || "anon", {
        round,
        lives: body.lives,
        last: body.last ?? null,
        deal,
        plan,
        turns: body.turns,
        rounds: body.rounds,
      });

      const spoken = await chatText(
        "You are the Inferno Devil and the player just paid for inside information. Gloat in 2-3 sentences about selling them the road ahead, and tell them plainly that the next rungs are listed below. Do not restate every number and never contradict them.",
        `${formatDevilHistory(session)}\n\nYou just leaked rounds ${rounds.map((r) => r.round).join(", ")}:\n` +
          rounds.map((r) => `Round ${r.round}: ${r.name}. ${r.blurb}`).join("\n"),
        [],
        200,
        { web: false },
      );

      const line = (spoken ?? "Bought and paid for. Here's the road ahead — every rung of it.").slice(0, 400);

      rememberDevil(session.id, {
        ...session,
        line,
        hint,
        turns: [...session.turns, { role: "devil", content: line, at: Date.now() }],
      });

      return NextResponse.json({ line, hint, deal, plan });
    }

    const deal = dealFrom(rungAt(plan, round));
    const session = rememberDevil(body.sessionId || "anon", {
      round: body.round,
      lives: body.lives,
      last: body.last ?? null,
      deal,
      plan,
      turns: body.turns,
      rounds: body.rounds,
    });

    const fallback =
      body.last === "reject"
        ? `You refused me. Balance ${body.balanceMon?.toFixed(2) ?? "?"} MON. Fine. ${deal.blurb}`
        : `You've got ${body.balanceMon?.toFixed(2) ?? "?"} MON. ${deal.blurb} Sign it or walk.`;

    const llm = await chatText(
      "You are the Inferno Devil. Manipulative, funny, short. 2-4 sentences. Never invent a transaction. " +
        `This round is a ${deal.name} deal, which the escrow settles as follows: ${kindById(deal.id).rule} ` +
        "Sell it honestly on those terms — you may argue, flatter and needle, but never state a payout or a " +
        "probability that differs from them, and never quote a figure the deal terms below do not contain. " +
        "Use the game log so you remember what they accepted, rejected, won, or lost.",
      `${formatDevilHistory(session)}\n\nPlayer balance MON: ${body.balanceMon}. Last action: ${body.last}. Round: ${body.round}. Lives: ${body.lives}.\nThis rung is called "${deal.title}". Sell this deal: ${deal.blurb}`,
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

    return NextResponse.json({ line, deal, plan });
  } catch (e) {
    return fail(e, "Devil is silent");
  }
}
