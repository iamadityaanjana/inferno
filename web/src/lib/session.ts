"use client";

import type { ChatTurn, DevilSession } from "./memory";

const SESSION_KEY = "inferno.session";
const CHAT_KEY = "inferno.chat";
const DEVIL_KEY = "inferno.devil";

export type SavedChatMsg = ChatTurn & {
  id: string;
  steps?: {
    id: string;
    label: string;
    status: "running" | "done" | "error";
    hash?: `0x${string}`;
    mon?: number;
    to?: string;
  }[];
};

export function getSessionId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function loadChat(): SavedChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedChatMsg[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

export function saveChat(turns: SavedChatMsg[]) {
  localStorage.setItem(CHAT_KEY, JSON.stringify(turns.slice(-40)));
}

export function historyFrom(messages: { role: "user" | "assistant"; content: string }[]): ChatTurn[] {
  return messages
    .filter((m) => m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.trim() }));
}

export function loadDevil(): DevilSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEVIL_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<DevilSession> & { id: string };
    // Sessions stored before a field existed would otherwise read as undefined
    // despite the type claiming otherwise.
    return { ...emptyDevil(saved.id), ...saved };
  } catch {
    return null;
  }
}

export function saveDevil(session: DevilSession) {
  localStorage.setItem(DEVIL_KEY, JSON.stringify(session));
}

export function emptyDevil(id: string): DevilSession {
  return {
    id,
    round: 1,
    lives: 2,
    last: null,
    deal: null,
    dealId: null,
    line: "Connect. Then we'll talk.",
    hint: null,
    plan: null,
    turns: [],
    rounds: [],
  };
}
