"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { AppNav } from "@/components/AppNav";
import { buttonClass } from "@/components/Button";
import type { PlanStep } from "@/app/api/orchestrate/route";
import { useCatalog } from "@/lib/catalog";
import { payAgent } from "@/lib/client-pay";
import { contractsReady, explorerTx } from "@/lib/contracts";
import { mon, shortHash } from "@/lib/format";
import { readApiJson } from "@/lib/http";
import { checkPolicy, loadPolicy } from "@/lib/policy";
import { getSessionId, historyFrom, loadChat, saveChat, type SavedChatMsg } from "@/lib/session";

type Step = NonNullable<SavedChatMsg["steps"]>[number];
type ChatMsg = SavedChatMsg;

export default function ChatPage() {
  const { chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { agents, refetch } = useCatalog();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [autoPay, setAutoPay] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPolicy();
    setSessionId(getSessionId());
    setMessages(loadChat());
    setHydrated(true);
    fetch("/api/pay")
      .then((r) => readApiJson<{ enabled?: boolean }>(r))
      .then((d) => setAutoPay(Boolean(d.enabled)))
      .catch(() => setAutoPay(false));
  }, []);

  useEffect(() => {
    if (hydrated) saveChat(messages);
  }, [messages, hydrated]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function contextPayload(extra: ChatMsg[] = []) {
    return { sessionId, history: historyFrom([...messages, ...extra]) };
  }

  function catalogPayload() {
    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      capabilities: a.capabilities,
      priceWei: a.priceWei.toString(),
    }));
  }

  function patchAssistant(asstId: string, patch: Partial<ChatMsg> | ((m: ChatMsg) => ChatMsg)) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== asstId) return m;
        return typeof patch === "function" ? patch(m) : { ...m, ...patch };
      }),
    );
  }

  function upsertStep(asstId: string, step: Step) {
    patchAssistant(asstId, (m) => {
      const steps = [...(m.steps ?? [])];
      const i = steps.findIndex((s) => s.id === step.id);
      if (i >= 0) steps[i] = step;
      else steps.push(step);
      return { ...m, steps };
    });
  }

  async function runTask(task: string) {
    const policy = loadPolicy();
    const userId = `u-${Date.now()}`;
    const asstId = `a-${Date.now()}`;
    const userMsg: ChatMsg = { id: userId, role: "user", content: task, at: Date.now() };
    setMessages((m) => [
      ...m,
      userMsg,
      { id: asstId, role: "assistant", content: "", steps: [{ id: "plan", label: "Breaking down the task", status: "running" }] },
    ]);
    setBusy(true);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, agents: catalogPayload(), ...contextPayload([userMsg]) }),
      });
      const plan = await readApiJson<{ steps?: PlanStep[]; error?: string }>(res);
      if (!res.ok || !plan.steps?.length) throw new Error(plan.error ?? "No plan");

      const total = plan.steps.reduce((s, step) => s + mon(BigInt(step.priceWei)), 0);
      const gate = checkPolicy(policy, total, total);
      if (!gate.ok) throw new Error(gate.reason);

      upsertStep(asstId, {
        id: "plan",
        label: `Hiring ${plan.steps.length} specialists · ${total.toFixed(3)} MON`,
        status: "done",
      });

      const results: { agentId: number; result: string; txHash: string }[] = [];
      for (const step of plan.steps) {
        const agent = agents.find((a) => a.id === step.agentId);
        const name = agent?.name ?? `Agent ${step.agentId}`;
        const price = agent?.priceWei ?? BigInt(step.priceWei);
        const stepId = `hire-${step.agentId}`;
        upsertStep(asstId, { id: stepId, label: `${name} · ${mon(price)} MON`, status: "running" });
        const hash = await payAgent({
          agentId: step.agentId,
          priceWei: price,
          auto: gate.autoPay,
          agentPayEnabled: autoPay,
          publicClient,
          chainId,
          writeContractAsync,
        });
        upsertStep(asstId, { id: stepId, label: `Paid ${name} · ${mon(price)} MON`, status: "done", hash });
        const run = await fetch(`/api/agents/${step.agentId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            txHash: hash,
            task,
            capabilities: agent?.capabilities,
            ...contextPayload([userMsg]),
          }),
        });
        const payload = await readApiJson<{ result?: string; error?: string }>(run);
        if (!run.ok) throw new Error(payload.error ?? "Hire failed");
        results.push({ agentId: step.agentId, result: payload.result ?? "", txHash: hash });
      }

      upsertStep(asstId, { id: "syn", label: "Writing the answer", status: "running" });
      const syn = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, results, ...contextPayload([userMsg]) }),
      });
      const done = await readApiJson<{ answer?: string; error?: string }>(syn);
      if (!syn.ok) throw new Error(done.error ?? "Could not write the answer");
      upsertStep(asstId, { id: "syn", label: "Answer ready", status: "done" });
      patchAssistant(asstId, { content: done.answer ?? "" });
      await refetch();
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Failed";
      patchAssistant(asstId, (m) => ({
        ...m,
        content: reason,
        steps: (m.steps ?? []).map((s) => (s.status === "running" ? { ...s, status: "error" as const } : s)),
      }));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const task = input.trim();
    if (!task || busy) return;
    setInput("");
    void runTask(task);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#eef0f5]">
      <div className="border-b border-[#e5e7eb] bg-white/80 px-5 py-4">
        <AppNav current="chat" />
      </div>

      <div ref={scroller} className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xl pt-16">
            <h1 className="display text-4xl">Ask anything.</h1>
            <p className="mt-3 text-[#5a6170]">The chat hires marketplace agents and answers here.</p>
          </div>
        )}
        {messages.map((msg) => (
          <article key={msg.id} className={`mx-auto w-full max-w-2xl ${msg.role === "user" ? "text-right" : ""}`}>
            {msg.role === "user" ? (
              <p className="inline-block rounded-2xl bg-[#14161c] px-4 py-2 text-left text-white">{msg.content}</p>
            ) : (
              <div className="text-left">
                {msg.steps && msg.steps.length > 0 && (
                  <ol className="mb-3 space-y-1.5 border-l-2 border-[#1E3A5F] pl-3 text-sm">
                    {msg.steps.map((step) => (
                      <li key={step.id}>
                        <span className="text-[11px] tracking-wide text-[#1E3A5F]">
                          {step.status === "running" ? "…" : step.status === "error" ? "×" : "✓"}
                        </span>{" "}
                        {step.label}
                        {step.hash && (
                          <a className="mono ml-2 text-[11px] text-[#1f4b99] underline" href={explorerTx(step.hash)} target="_blank" rel="noreferrer">
                            {shortHash(step.hash)}
                          </a>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
                {msg.content && <p className="whitespace-pre-wrap text-[15px] leading-7">{msg.content}</p>}
              </div>
            )}
          </article>
        ))}
      </div>

      <form onSubmit={onSubmit} className="border-t border-[#e2e5ec] bg-white px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            rows={2}
            className="min-h-[48px] flex-1 resize-none rounded-2xl border border-[#e5e7eb] bg-[#eef0f5] px-3 py-2 text-[#111827] placeholder:text-[#9AA1AD]"
            placeholder="Message…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            disabled={busy || !contractsReady()}
          />
          <button
            type="submit"
            className={buttonClass("primary", "lg")}
            disabled={busy || !input.trim() || !contractsReady()}
          >
            {busy ? "Working" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
