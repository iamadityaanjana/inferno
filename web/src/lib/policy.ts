export type Policy = {
  name: string;
  maxPerTaskMon: number;
  maxDailyMon: number;
  requireApprovalAboveMon: number;
};

const KEY = "inferno-policy";
const SPEND_KEY = "inferno-daily-spend";

export const defaultPolicy: Policy = {
  name: "ResearchAgent",
  maxPerTaskMon: 0.5,
  maxDailyMon: 2,
  requireApprovalAboveMon: 0.5,
};

export function loadPolicy(): Policy | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return { ...defaultPolicy, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function savePolicy(policy: Policy) {
  localStorage.setItem(KEY, JSON.stringify(policy));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadDailySpend(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(SPEND_KEY);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw) as { day: string; mon: number };
    if (parsed.day !== todayKey()) return 0;
    return parsed.mon;
  } catch {
    return 0;
  }
}

export function addDailySpend(mon: number) {
  const next = loadDailySpend() + mon;
  localStorage.setItem(SPEND_KEY, JSON.stringify({ day: todayKey(), mon: next }));
  return next;
}

export function checkPolicy(policy: Policy, stepCostMon: number, taskTotalMon: number) {
  if (taskTotalMon > policy.maxPerTaskMon) {
    return { ok: false as const, reason: `Task total ${taskTotalMon.toFixed(3)} MON exceeds max ${policy.maxPerTaskMon} MON` };
  }
  if (loadDailySpend() + taskTotalMon > policy.maxDailyMon) {
    return { ok: false as const, reason: `Daily cap ${policy.maxDailyMon} MON would be exceeded` };
  }
  return {
    ok: true as const,
    needsApproval: stepCostMon > policy.requireApprovalAboveMon || taskTotalMon > policy.requireApprovalAboveMon,
  };
}
