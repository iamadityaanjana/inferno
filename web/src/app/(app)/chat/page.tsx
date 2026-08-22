"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { ArrowUpIcon } from "@/components/icons";
import { Markdown } from "@/components/Markdown";
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

const OPENERS = [
  "Compare the top three lending pools on Monad and flag the riskiest one.",
  "What shipped on Monad this week that matters to a DeFi builder?",
  "Research whether stMON is safe to use as collateral right now.",
];

export default function ChatPage() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const { agents, refetch } = useCatalog();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const launched = useRef(false);

  useEffect(() => {
    loadPolicy();
    setSessionId(getSessionId());
    setMessages(loadChat());
    setHydrated(true);
    const handoff = new URLSearchParams(window.location.search).get("task");
    if (handoff?.trim()) {
      setPendingTask(handoff.trim());
      window.history.replaceState(null, "", "/chat");
    }
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
      {
        id: asstId,
        role: "assistant",
        content: "",
        steps: [{ id: "plan", label: "Breaking down the task", status: "running" }],
      },
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
          address,
          publicClient,
          chainId,
          signTypedDataAsync,
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

  function submit(task: string) {
    if (!task || busy) return;
    setInput("");
    void runTask(task);
  }

  // A task handed over from the landing hero runs as soon as the roster loads.
  useEffect(() => {
    if (launched.current || !pendingTask || !hydrated || !sessionId) return;
    if (agents.length === 0) return;
    launched.current = true;
    const task = pendingTask;
    setPendingTask(null);
    void runTask(task);
  });

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[#eeeeea] px-4 py-3 sm:px-5">
        <div>
          <h1 className="heading text-[16px] leading-tight text-[#1c1c1a]">Chat</h1>
          <p className="text-[12px] text-[#8a8a82]">
            {agents.length > 0 ? `${agents.length} agents on the bench` : "Loading the bench…"}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="rounded-lg px-2.5 py-1 text-[12px] font-medium text-[#5f5f59] transition-colors hover:bg-[#f4f4f1] hover:text-[#1c1c1a]"
          >
            Clear
          </button>
        )}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-5">
        {empty && (
          <div className="mx-auto max-w-xl pt-10 sm:pt-20">
            <h2 className="heading text-[30px] leading-tight text-[#1c1c1a]">What do you need answered?</h2>
            <p className="mt-2 text-[14px] leading-6 text-[#8a8a82]">
              Describe the task. Inferno picks the specialists, pays them in MON, and writes the answer here.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              {OPENERS.map((opener) => (
                <button
                  key={opener}
                  type="button"
                  onClick={() => submit(opener)}
                  disabled={busy || !contractsReady()}
                  className="rounded-xl border border-[#e6e6e2] bg-white px-3.5 py-2.5 text-left text-[13px] leading-5 text-[#55554f] transition-colors hover:border-[#d4d4d0] hover:bg-[#fafaf8] hover:text-[#1c1c1a] disabled:opacity-50"
                >
                  {opener}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <article key={msg.id} className="mx-auto w-full max-w-2xl">
            {msg.role === "user" ? (
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl bg-[#1c1c1a] px-3.5 py-2 text-[14px] leading-6 text-white">
                  {msg.content}
                </p>
              </div>
            ) : (
              <div>
                {msg.steps && msg.steps.length > 0 && (
                  <ol className="mb-3 space-y-1.5 rounded-xl border border-[#eeeeea] bg-[#fafaf8] p-3 text-[12.5px]">
                    {msg.steps.map((step) => (
                      <li key={step.id} className="flex items-start gap-2">
                        <span
                          className={
                            step.status === "error"
                              ? "text-[#c0392b]"
                              : step.status === "running"
                                ? "text-[#8a8a82]"
                                : "text-[#1f8a6a]"
                          }
                        >
                          {step.status === "running" ? "○" : step.status === "error" ? "×" : "✓"}
                        </span>
                        <span className="text-[#55554f]">
                          {step.label}
                          {step.hash && (
                            <a
                              className="mono ml-2 text-[11px] text-[#8a8a82] underline decoration-[#d4d4d0] hover:text-[#1c1c1a]"
                              href={explorerTx(step.hash)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {shortHash(step.hash)}
                            </a>
                          )}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                {msg.content && <Markdown>{msg.content}</Markdown>}
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="border-t border-[#eeeeea] px-4 py-3 sm:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input.trim());
          }}
          className="mx-auto max-w-2xl"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-[#e6e6e2] bg-white p-2 transition-colors focus-within:border-[#c9c9c2]">
            <textarea
              rows={1}
              className="max-h-40 min-h-8 flex-1 resize-none bg-transparent px-2 py-1 text-[14px] leading-6 text-[#1c1c1a] outline-none placeholder:text-[#a3a39b]"
              placeholder={contractsReady() ? "Ask anything…" : "Contracts not configured"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input.trim());
                }
              }}
              disabled={busy || !contractsReady()}
            />
            <button
              type="submit"
              aria-label="Send"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#1c1c1a] text-white transition-colors hover:bg-[#33332f] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={busy || !input.trim() || !contractsReady()}
            >
              <ArrowUpIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 px-1 text-[11.5px] text-[#a3a39b]">
            {busy ? "Hiring specialists…" : "Every hire is paid in MON and shown with an explorer link."}
          </p>
        </form>
      </div>
    </div>
  );
}
