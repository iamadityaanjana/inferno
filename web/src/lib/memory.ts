export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  at?: number;
};

export type DevilTurn = {
  role: "devil" | "player";
  content: string;
  at?: number;
};

export type DevilRound = {
  round: number;
  dealName: string;
  action: "accept" | "reject" | "resolve";
  won?: boolean;
  hash?: string;
  stake?: string;
};

export type DevilDeal = { id: number; name: string; stake: string; blurb: string; title?: string };

/**
 * One rung of an LLM-generated run. `kind` indexes DevilEscrow.DealType, so the
 * payout maths is never the model's to choose — only the shape of the run is.
 */
export type DevilPlanRound = {
  round: number;
  kind: 0 | 1 | 2;
  stake: string;
  title: string;
};

export type DevilHintRound = { round: number; name: string; stake: string; blurb: string };

/**
 * What an INFO deal buys. The next round's terms alone would be worthless — the
 * deal blurb states them anyway — so it leaks the road ahead instead, which is
 * the only way to see whether the ladder is worth climbing.
 */
export type DevilHint = { rounds: DevilHintRound[] };

export type DevilSession = {
  id: string;
  round: number;
  lives: number;
  last: "accept" | "reject" | null;
  deal: DevilDeal | null;
  dealId: string | null;
  line: string;
  hint: DevilHint | null;
  /** The run's rungs, generated once and then kept so a leak cannot lie. */
  plan: DevilPlanRound[] | null;
  turns: DevilTurn[];
  rounds: DevilRound[];
};

const chatMem = new Map<string, ChatTurn[]>();
const devilMem = new Map<string, DevilSession>();

export function rememberChat(sessionId: string, incoming: ChatTurn[]) {
  const cleaned = incoming
    .filter((t) => t.content.trim())
    .slice(-24)
    .map((t) => ({ role: t.role, content: t.content.trim(), at: t.at ?? Date.now() }));
  const existing = chatMem.get(sessionId) ?? [];
  const next = cleaned.length >= existing.length ? cleaned : existing;
  chatMem.set(sessionId, next);
  return next;
}

export function rememberDevil(sessionId: string, incoming: Partial<DevilSession>): DevilSession {
  const prev = devilMem.get(sessionId);
  const next: DevilSession = {
    id: sessionId,
    round: incoming.round ?? prev?.round ?? 1,
    lives: incoming.lives ?? prev?.lives ?? 2,
    last: incoming.last ?? prev?.last ?? null,
    deal: incoming.deal ?? prev?.deal ?? null,
    dealId: incoming.dealId ?? prev?.dealId ?? null,
    line: incoming.line ?? prev?.line ?? "",
    hint: incoming.hint ?? prev?.hint ?? null,
    plan: incoming.plan ?? prev?.plan ?? null,
    turns: (incoming.turns ?? prev?.turns ?? []).slice(-30),
    rounds: (incoming.rounds ?? prev?.rounds ?? []).slice(-20),
  };
  devilMem.set(sessionId, next);
  return next;
}

export function formatChatHistory(turns: ChatTurn[]) {
  if (!turns.length) return "No prior conversation.";
  return turns
    .slice(-12)
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");
}

export function formatDevilHistory(session: DevilSession) {
  const rounds = session.rounds.length
    ? session.rounds
        .map((r) => {
          const outcome =
            r.action === "resolve" ? (r.won ? "won" : "lost") : r.action;
          return `Round ${r.round}: ${r.dealName} ${r.stake ?? ""} MON — ${outcome}${r.hash ? ` (${r.hash.slice(0, 10)}…)` : ""}`;
        })
        .join("\n")
    : "No resolved rounds yet.";
  const talk = session.turns.length
    ? session.turns
        .slice(-12)
        .map((t) => `${t.role === "devil" ? "Devil" : "Player"}: ${t.content}`)
        .join("\n")
    : "No prior dialogue.";
  return `Game log:\n${rounds}\n\nDialogue:\n${talk}`;
}
