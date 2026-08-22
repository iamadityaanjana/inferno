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

export type DevilDeal = { id: number; name: string; stake: string; blurb: string };

export type DevilSession = {
  id: string;
  round: number;
  lives: number;
  last: "accept" | "reject" | null;
  deal: DevilDeal | null;
  dealId: string | null;
  line: string;
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
