"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, useBalance, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { paymentRouterAbi, registryAbi } from "@/lib/abi";
import { PAY_GAS, PAYMENT_ROUTER, PAY_TO, REGISTRY, contractsReady, explorerAddress, explorerTx } from "@/lib/contracts";
import { mon, shortAddr, shortHash } from "@/lib/format";
import { addDailySpend, checkPolicy, defaultPolicy, loadPolicy, savePolicy, type Policy } from "@/lib/policy";
import type { PlanStep } from "@/app/api/orchestrate/route";

type AgentView = {
  id: number;
  name: string;
  capabilities: string;
  priceWei: bigint;
  jobs: bigint;
  active: boolean;
};

type Step = {
  id: string;
  label: string;
  status: "running" | "done" | "error";
  hash?: `0x${string}`;
  mon?: number;
  to?: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps?: Step[];
};

type AgentWallet = { enabled: boolean; address?: string; balance?: string; autoCapMon?: string };

export default function DashboardPage() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: userBal } = useBalance({ address, chainId: monadTestnet.id, query: { enabled: Boolean(address) } });

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Policy>(defaultPolicy);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [agentWallet, setAgentWallet] = useState<AgentWallet>({ enabled: false });
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPolicy(loadPolicy());
    fetch("/api/pay")
      .then((r) => r.json())
      .then((d: AgentWallet) => setAgentWallet(d))
      .catch(() => setAgentWallet({ enabled: false }));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const { data: count } = useReadContract({
    address: REGISTRY,
    abi: registryAbi,
    functionName: "agentCount",
    query: { enabled: contractsReady() },
  });

  const agentIds = useMemo(() => {
    const n = Number(count ?? 0);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [count]);

  const { data: agentReads, refetch: refetchAgents } = useReadContracts({
    contracts: agentIds.map((id) => ({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "getAgent" as const,
      args: [BigInt(id)],
    })),
    query: { enabled: contractsReady() && agentIds.length > 0 },
  });

  const agents: AgentView[] = (agentReads ?? []).flatMap((row, i) => {
    if (row.status !== "success" || !row.result) return [];
    const a = row.result;
    return [{ id: agentIds[i], name: a.name, capabilities: a.capabilities, priceWei: a.priceWei, jobs: a.jobs, active: a.active }];
  });

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

  async function payAgent(agentId: number, priceWei: bigint, label: string, auto: boolean) {
    const cost = mon(priceWei);
    if (auto && agentWallet.enabled) {
      const res = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, priceWei: priceWei.toString() }),
      });
      const data = (await res.json()) as { hash?: `0x${string}`; error?: string };
      if (!res.ok || !data.hash) throw new Error(data.error ?? "Agent pay failed");
      addDailySpend(cost);
      return data.hash;
    }
    if (!publicClient) throw new Error("Connect a wallet to sign this hire");
    if (chainId !== monadTestnet.id) throw new Error("Switch to Monad Testnet");
    const hash = await writeContractAsync({
      address: PAYMENT_ROUTER,
      abi: paymentRouterAbi,
      functionName: "pay",
      args: [BigInt(agentId)],
      value: priceWei,
      gas: PAY_GAS,
      chainId: monadTestnet.id,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Payment reverted");
    addDailySpend(cost);
    return hash;
  }

  async function runTask(task: string) {
    if (!policy) return;
    const userId = `u-${Date.now()}`;
    const asstId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: userId, role: "user", content: task },
      { id: asstId, role: "assistant", content: "", steps: [{ id: "plan", label: "Breaking down the task", status: "running" }] },
    ]);
    setBusy(true);
    try {
      const res = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      });
      const plan = (await res.json()) as { steps?: PlanStep[]; error?: string };
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
        upsertStep(asstId, {
          id: stepId,
          label: `${name} · ${mon(price)} MON`,
          status: "running",
          mon: mon(price),
          to: PAY_TO,
        });
        const hash = await payAgent(step.agentId, price, name, gate.autoPay);
        upsertStep(asstId, {
          id: stepId,
          label: `Paid ${name} · ${mon(price)} MON → sink`,
          status: "done",
          hash,
          mon: mon(price),
          to: PAY_TO,
        });
        const run = await fetch(`/api/agents/${step.agentId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: hash, task }),
        });
        const payload = (await run.json()) as { result?: string; error?: string };
        if (!run.ok) throw new Error(payload.error ?? "Hire not confirmed on-chain");
        results.push({ agentId: step.agentId, result: payload.result ?? "", txHash: hash });
      }

      upsertStep(asstId, { id: "syn", label: "Writing the answer", status: "running" });
      const syn = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, results }),
      });
      const done = (await syn.json()) as { answer?: string };
      upsertStep(asstId, { id: "syn", label: "Answer ready", status: "done" });
      patchAssistant(asstId, { content: done.answer ?? "" });
      await refetchAgents();
      fetch("/api/pay")
        .then((r) => r.json())
        .then((d: AgentWallet) => setAgentWallet(d))
        .catch(() => undefined);
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
    if (!task || busy || !policy) return;
    setInput("");
    void runTask(task);
  }

  const sink = PAY_TO;
  const agentBal = agentWallet.balance ? Number(formatEther(BigInt(agentWallet.balance))) : null;

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-6 border-b border-[#2b1d16] bg-[#1a1410] px-5 py-5 lg:w-80 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between">
          <Link href="/" className="display text-2xl">
            Inferno
          </Link>
          <ConnectButton />
        </div>

        <section className="space-y-2 text-sm">
          <p className="text-[11px] tracking-[0.18em] text-[#c9a36b]">MONEY</p>
          <p className="leading-6 text-[#9a8070]">
            Hires go through PaymentRouter and land in the marketplace sink. The router keeps nothing.
          </p>
          <a className="mono block text-xs text-[#c9a36b] underline" href={explorerAddress(sink)} target="_blank" rel="noreferrer">
            Sink {shortAddr(sink || "0x")}
          </a>
          {agentWallet.enabled && agentWallet.address && (
            <p className="text-xs text-[#9a8070]">
              Agent pays from{" "}
              <a className="mono underline" href={explorerAddress(agentWallet.address)} target="_blank" rel="noreferrer">
                {shortAddr(agentWallet.address)}
              </a>
              {agentBal != null && <> · {agentBal.toFixed(3)} MON</>}
              . Auto under {policy?.requireApprovalAboveMon ?? 0.5} MON / task.
            </p>
          )}
          {isConnected && userBal && (
            <p className="text-xs text-[#9a8070]">
              Connected wallet {Number(formatEther(userBal.value)).toFixed(3)} MON
              {sink && address?.toLowerCase() !== sink.toLowerCase() && (
                <> — this is not the sink. Look at the sink address, not this wallet.</>
              )}
            </p>
          )}
        </section>

        {!policy ? (
          <section className="space-y-3">
            <p className="text-[11px] tracking-[0.18em] text-[#c9a36b]">CREATE AGENT</p>
            <label className="block text-xs text-[#9a8070]">
              Name
              <input
                className="mt-1 w-full rounded-sm border border-[#2b1d16] bg-[#0c0908] px-3 py-2 text-sm text-[#f2e6d4]"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="block text-xs text-[#9a8070]">
              Auto-pay up to (MON)
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-sm border border-[#2b1d16] bg-[#0c0908] px-3 py-2 text-sm text-[#f2e6d4]"
                value={draft.requireApprovalAboveMon}
                onChange={(e) => setDraft({ ...draft, requireApprovalAboveMon: Number(e.target.value) })}
              />
            </label>
            <label className="block text-xs text-[#9a8070]">
              Max / task
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-sm border border-[#2b1d16] bg-[#0c0908] px-3 py-2 text-sm text-[#f2e6d4]"
                value={draft.maxPerTaskMon}
                onChange={(e) => setDraft({ ...draft, maxPerTaskMon: Number(e.target.value) })}
              />
            </label>
            <button
              className="w-full rounded-sm bg-[#c23b22] px-3 py-2 text-sm font-medium"
              onClick={() => {
                savePolicy(draft);
                setPolicy(draft);
              }}
            >
              Save
            </button>
          </section>
        ) : (
          <p className="text-xs text-[#9a8070]">
            {policy.name} · auto ≤ {policy.requireApprovalAboveMon} MON · hard cap {policy.maxPerTaskMon} MON
          </p>
        )}

        <section>
          <p className="mb-2 text-[11px] tracking-[0.18em] text-[#c9a36b]">MARKETPLACE</p>
          <ul className="space-y-2">
            {agents.map((agent) => (
              <li key={agent.id} className="border-t border-[#2b1d16] pt-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm">{agent.name}</span>
                  <span className="mono text-xs text-[#c9a36b]">{mon(agent.priceWei)} MON</span>
                </div>
                <p className="text-[11px] text-[#9a8070]">{agent.jobs.toString()} jobs</p>
              </li>
            ))}
          </ul>
        </section>

        <Link href="/devil" className="mt-auto text-sm text-[#c9a36b]">
          Devil Mode →
        </Link>
      </aside>

      <main className="flex min-h-[70vh] flex-1 flex-col bg-[#f2e6d4] text-[#1a1410]">
        <div ref={scroller} className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8">
          {messages.length === 0 && (
            <div className="mx-auto max-w-xl pt-16">
              <h1 className="display text-4xl text-[#1a1410]">Ask the agent.</h1>
              <p className="mt-3 text-[#6b5348]">
                It will pick specialists, pay the sink, then answer. Try: research the best Monad DeFi opportunity for 5 MON.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <article key={msg.id} className={`mx-auto w-full max-w-2xl ${msg.role === "user" ? "text-right" : ""}`}>
              {msg.role === "user" ? (
                <p className="inline-block rounded-sm bg-[#1a1410] px-4 py-2 text-left text-[#f2e6d4]">{msg.content}</p>
              ) : (
                <div className="text-left">
                  {msg.steps && msg.steps.length > 0 && (
                    <ol className="mb-3 space-y-1.5 border-l-2 border-[#c23b22] pl-3 text-sm">
                      {msg.steps.map((step) => (
                        <li key={step.id} className="text-[#4a3a32]">
                          <span className="text-[11px] tracking-wide text-[#c23b22]">
                            {step.status === "running" ? "…" : step.status === "error" ? "×" : "✓"}
                          </span>{" "}
                          {step.label}
                          {step.hash && (
                            <a className="mono ml-2 text-[11px] text-[#8a5a20] underline" href={explorerTx(step.hash)} target="_blank" rel="noreferrer">
                              {shortHash(step.hash)}
                            </a>
                          )}
                          {step.to && (
                            <a className="mono ml-2 text-[11px] text-[#6b5348] underline" href={explorerAddress(step.to)} target="_blank" rel="noreferrer">
                              to {shortAddr(step.to)}
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

        <form onSubmit={onSubmit} className="border-t border-[#d8c4aa] bg-[#ead9c2] px-4 py-4 sm:px-8">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              rows={2}
              className="min-h-[48px] flex-1 resize-none rounded-sm border border-[#c9b396] bg-[#f2e6d4] px-3 py-2 text-[#1a1410] placeholder:text-[#9a8070]"
              placeholder={policy ? "Message the agent…" : "Create an agent in the sidebar first"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
              disabled={!policy || busy || !contractsReady()}
            />
            <button
              type="submit"
              className="rounded-sm bg-[#c23b22] px-4 py-3 text-sm font-medium text-[#f2e6d4]"
              disabled={!policy || busy || !input.trim() || !contractsReady()}
            >
              {busy ? "Working" : "Send"}
            </button>
          </div>
          {!agentWallet.enabled && (
            <p className="mx-auto mt-2 max-w-2xl text-xs text-[#6b5348]">
              Add AGENT_PRIVATE_KEY to web/.env so the agent can pay itself under the auto-pay limit.
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
