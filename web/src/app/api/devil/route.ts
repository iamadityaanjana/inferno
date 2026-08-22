import { NextResponse } from "next/server";
import { fail, readBody } from "@/lib/http";
import {
  formatDevilHistory,
  rememberDevil,
  type DevilPlanRound,
  type DevilRound,
  type DevilTurn,
} from "@/lib/memory";
import { chatJson, chatText } from "@/lib/openrouter";

const ROUNDS = 10;
/** Testnet-friendly bounds. DevilEscrow additionally caps a stake at 2 MON. */
const MIN_STAKE = 0.01;
const MAX_STAKE = 0.3;

/** Drops trailing zeros so a payout reads "0.06 MON", not "0.060 MON". */
function mon(n: number) {
  return String(Number(n.toFixed(4)));
}

/**
 * Multipliers mirror DevilEscrow.resolve exactly — 1.4x, 3x on a 60% roll, 0.
 *
 * `rule` is what we teach the model; `payout` is what we show the player. They
 * live together so the briefing can never drift away from the real economics.
 */
const KINDS = [
  {
    id: 0,
    name: "GUARANTEED",
    rule: "the contract returns exactly 1.4x the stake, always. Expected value 1.4x — a safe, dull win.",
    payout: (s: number) => `Contract returns ${mon(s * 1.4)} MON.`,
  },
  {
    id: 1,
    name: "RISKY",
    rule:
      "the contract pays 3x the stake on a 60% roll and nothing on the other 40%. " +
      "Expected value 1.8x, so this is the player's best deal and the house bleeds on it — deal it sparingly.",
    payout: (s: number) => `~60% chance the contract pays ${mon(s * 3)} MON.`,
  },
  {
    id: 2,
    name: "INFO",
    rule:
      "the stake is lost and pays nothing back; it buys the terms of the next three rounds. " +
      "Expected value 0x, pure profit for the house, so it is your toll booth — but three or more in a run feels like a scam.",
    payout: () => "Stake stays in the house. You buy the next three rounds' terms instead.",
  },
] as const;

/** The full economics briefing, generated from the table above. */
const ECONOMICS = KINDS.map((k) => `kind ${k.id} (${k.name}): ${k.rule}`).join("\n");

function clampStake(raw: unknown, fallback: number) {
  const n = typeof raw === "number" ? raw : Number(raw);
  const safe = Number.isFinite(n) && n > 0 ? n : fallback;
  return String(Number(Math.min(MAX_STAKE, Math.max(MIN_STAKE, safe)).toFixed(2)));
}

/**
 * Titles are flavour, so they carry no digits or markup — a rung named
 * "pays 500x" sitting beside a server-computed 1.4x blurb reads as a promise.
 */
function cleanTitle(raw: unknown, round: number) {
  const text = typeof raw === "string" ? raw.replace(/[^A-Za-z' -]/g, " ").replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 40).trim() : `Round ${round}`;
}

function clampKind(raw: unknown): 0 | 1 | 2 {
  const n = Number(raw);
  return n === 0 || n === 1 || n === 2 ? n : 1;
}

/**
 * A run with no LLM behind it. Still random, so the game never falls back to a
 * fixed script when the model is unavailable or its output is unusable.
 */
function randomPlan(): DevilPlanRound[] {
  return Array.from({ length: ROUNDS }, (_, i) => {
    const round = i + 1;
    // Weighted so a run is mostly playable deals with the odd toll booth.
    const roll = Math.random();
    const kind: 0 | 1 | 2 = roll < 0.4 ? 1 : roll < 0.75 ? 0 : 2;
    const drift = 0.02 + (round / ROUNDS) * 0.18 + Math.random() * 0.05;
    return { round, kind, stake: clampStake(drift, 0.02), title: `Round ${round}` };
  });
}

/**
 * Rolls how many of each deal type a run contains, plus its opening rung.
 *
 * Variety is dealt here rather than asked for, because a model given the same
 * brief converges on the same run — four sampled runs came back as the same
 * GRIRGIRGIR skeleton before this existed. The model still places, paces and
 * names the rungs; it just cannot decide that every run looks alike.
 */
function composition() {
  const info = 1 + Math.floor(Math.random() * 3); // 1-3 toll booths.
  const risky = 2 + Math.floor(Math.random() * 3); // 2-4 gambles.
  const counts = [ROUNDS - info - risky, risky, info];
  const opening = Math.random() < 0.7 ? 0 : 1; // Usually open gently.
  return { counts, opening };
}

/**
 * Asks the model to compose a run, briefed on the real economics, then rewrites
 * every number it returned.
 *
 * The briefing is what makes a run well-paced: a model that knows INFO is a
 * pure toll and RISKY is player-favourable places them deliberately. The rewrite
 * is what makes it safe: the model still has to do arithmetic to reach a payout,
 * and a slipped digit here is a promise of money the escrow will refuse to pay,
 * with the player absorbing the difference. So we teach it the maths and then
 * decline to trust it — the shown figures always come from KINDS.
 */
async function buildPlan(balanceMon?: number, lives?: number): Promise<DevilPlanRound[]> {
  const purse = typeof balanceMon === "number" && balanceMon > 0 ? balanceMon : null;
  const mix = composition();
  const raw = await chatJson(
    "You are the Inferno Devil, designing a gauntlet you intend to profit from.\n\n" +
      `The escrow contract settles every deal and its maths is fixed and unchangeable:\n${ECONOMICS}\n\n` +
      `Reply with JSON only: {"rounds":[{"round":1,"kind":0,"stake":0.02,"title":"short evocative name"}]}, ` +
      `exactly ${ROUNDS} entries.\n` +
      `stake is a number in MON between ${MIN_STAKE} and ${MAX_STAKE}, and should broadly escalate so the opening ` +
      "ask is easy to say yes to and the last one hurts.\n" +
      "Design deliberately: use kind 1 as the bait that keeps them playing, and place kind 2 where they are most " +
      "desperate for a way out. Avoid any repeating cycle of kinds — the shape should look composed, not alternated.\n" +
      "Titles are at most four words, menacing, and contain no numbers or payout claims — the contract states the " +
      "terms, you only name the rung.",
    `Design a fresh ${ROUNDS}-round run using exactly this mix, in an order of your choosing: ` +
      `${mix.counts[0]} of kind 0, ${mix.counts[1]} of kind 1, ${mix.counts[2]} of kind 2. ` +
      `Round 1 must be kind ${mix.opening}. ` +
      (purse ? `The player is carrying about ${purse.toFixed(2)} MON, so keep it affordable enough to keep saying yes. ` : "") +
      (typeof lives === "number" ? `They have ${lives} lives. ` : "") +
      `Seed ${Math.random().toString(36).slice(2, 10)}.`,
    [],
    900,
    // Planning is a creative call, not an extraction one; the default 0.4 makes
    // every run the same run.
    1,
  );
  if (!raw) return randomPlan();

  try {
    const parsed = JSON.parse(raw) as { rounds?: unknown[] };
    const list = Array.isArray(parsed.rounds) ? parsed.rounds : [];
    if (list.length < ROUNDS) return randomPlan();

    const spare = randomPlan();
    let corrected = 0;
    const plan = list.slice(0, ROUNDS).map((entry, i) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const kind = clampKind(row.kind);
      const stake = clampStake(row.stake, Number(spare[i].stake));
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
    return kinds.size >= 2 ? plan : randomPlan();
  } catch {
    return randomPlan();
  }
}

function dealFrom(rung: DevilPlanRound) {
  const kind = KINDS[rung.kind];
  return {
    id: kind.id,
    name: kind.name,
    stake: rung.stake,
    title: rung.title,
    blurb: `Pay ${rung.stake} MON. ${kind.payout(Number(rung.stake))}`,
  };
}

/** Keeps a client-supplied plan usable without trusting a single field of it. */
function adoptPlan(raw: unknown): DevilPlanRound[] | null {
  if (!Array.isArray(raw) || raw.length !== ROUNDS) return null;
  const spare = randomPlan();
  return raw.map((entry, i) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    return {
      round: i + 1,
      kind: clampKind(row.kind),
      stake: clampStake(row.stake, Number(spare[i].stake)),
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
    const plan = adoptPlan(body.plan) ?? (await buildPlan(body.balanceMon, body.lives));

    // An INFO deal has been paid for, so it must hand over something the player
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
        `This round is a ${deal.name} deal, which the escrow settles as follows: ${KINDS[deal.id].rule} ` +
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
