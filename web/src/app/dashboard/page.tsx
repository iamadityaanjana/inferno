"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import { monadTestnet } from "wagmi/chains";
import { useAccount, useBalance, usePublicClient, useReadContract, useReadContracts, useWriteContract } from "wagmi";
import { ConnectButton } from "@/components/ConnectButton";
import { Feed } from "@/components/Feed";
import { paymentRouterAbi, registryAbi } from "@/lib/abi";
import { type Activity, pushActivity } from "@/lib/activity";
import { PAY_GAS, PAYMENT_ROUTER, REGISTRY, contractsReady } from "@/lib/contracts";
import { mon } from "@/lib/format";
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

export default function DashboardPage() {
  const { address, isConnected, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { data: bal } = useBalance({ address, chainId: monadTestnet.id, query: { enabled: Boolean(address) } });

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Policy>(defaultPolicy);
  const [task, setTask] = useState("Research the best Monad DeFi opportunity for 5 MON.");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [feed, setFeed] = useState<Activity[]>([]);
  const [spent, setSpent] = useState(0);
  const [txCount, setTxCount] = useState(0);

  useEffect(() => {
    setPolicy(loadPolicy());
  }, []);

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
    return [
      {
        id: agentIds[i],
        name: a.name,
        capabilities: a.capabilities,
        priceWei: a.priceWei,
        jobs: a.jobs,
        active: a.active,
      },
    ];
  });

  async function payAgent(agentId: number, priceWei: bigint, label: string) {
    if (!publicClient) throw new Error("No public client");
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
    const cost = mon(priceWei);
    setSpent((s) => s + cost);
    setTxCount((n) => n + 1);
    addDailySpend(cost);
    setFeed((f) => pushActivity(f, `Hired ${label}`, { hash, mon: cost }));
    return hash;
  }

  async function hireOne(agent: AgentView) {
    if (!policy) return;
    setError(null);
    const cost = mon(agent.priceWei);
    const gate = checkPolicy(policy, cost, cost);
    if (!gate.ok) {
      setError(gate.reason);
      return;
    }
    if (gate.needsApproval && !confirm(`Approve ${cost} MON hire of ${agent.name}?`)) return;
    setBusy(true);
    try {
      await payAgent(agent.id, agent.priceWei, agent.name);
      await refetchAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "pay failed");
    } finally {
      setBusy(false);
    }
  }

  async function runTask() {
    if (!policy) return;
    setError(null);
    setAnswer(null);
    setBusy(true);
    setFeed((f) => pushActivity(f, `${policy.name} received task`));
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
      if (gate.needsApproval && !confirm(`Approve task spend ${total} MON?`)) throw new Error("Rejected");

      setFeed((f) => pushActivity(f, `Discovered ${plan.steps!.length} services`));

      const results: { agentId: number; result: string; txHash: string }[] = [];
      for (const step of plan.steps) {
        const agent = agents.find((a) => a.id === step.agentId);
        const name = agent?.name ?? `Agent ${step.agentId}`;
        const hash = await payAgent(step.agentId, BigInt(step.priceWei), name);
        const run = await fetch(`/api/agents/${step.agentId}/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: hash, task }),
        });
        const payload = (await run.json()) as { result?: string; error?: string };
        if (!run.ok) throw new Error(payload.error ?? "agent refused unpaid work");
        results.push({ agentId: step.agentId, result: payload.result ?? "", txHash: hash });
        setFeed((f) => pushActivity(f, `${name} completed task`));
      }

      const syn = await fetch("/api/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, results }),
      });
      const done = (await syn.json()) as { answer?: string };
      setAnswer(done.answer ?? "");
      setFeed((f) => pushActivity(f, "Final answer generated"));
      await refetchAgents();
    } catch (e) {
      setError(e instanceof Error ? e.message : "run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-xl font-semibold tracking-tight">
            INFERNO
          </Link>
          <p className="text-xs text-[#b08978]">Agent economy · live MON payments</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/devil" className="text-sm text-[#ffb020]">
            Devil Mode
          </Link>
          <ConnectButton />
        </div>
      </header>

      {!contractsReady() && (
        <p className="rounded-md border border-[#ff3b1f] px-3 py-2 text-sm">
          Contracts not configured. Copy <span className="mono">web/.env.example</span> →{" "}
          <span className="mono">web/.env.local</span> after deploy.
        </p>
      )}

      {!policy ? (
        <section className="rounded-xl border border-[#3a1a14] p-5">
          <h2 className="mb-3 font-semibold">Create agent</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Name
              <input
                className="mt-1 w-full rounded-md border border-[#3a1a14] bg-black/40 px-3 py-2"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Max spend / task (MON)
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-[#3a1a14] bg-black/40 px-3 py-2"
                value={draft.maxPerTaskMon}
                onChange={(e) => setDraft({ ...draft, maxPerTaskMon: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm">
              Max daily spend (MON)
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-[#3a1a14] bg-black/40 px-3 py-2"
                value={draft.maxDailyMon}
                onChange={(e) => setDraft({ ...draft, maxDailyMon: Number(e.target.value) })}
              />
            </label>
            <label className="text-sm">
              Require approval above (MON)
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-[#3a1a14] bg-black/40 px-3 py-2"
                value={draft.requireApprovalAboveMon}
                onChange={(e) => setDraft({ ...draft, requireApprovalAboveMon: Number(e.target.value) })}
              />
            </label>
          </div>
          <button
            className="mt-4 rounded-md bg-[#ff3b1f] px-4 py-2 text-sm font-semibold"
            onClick={() => {
              savePolicy(draft);
              setPolicy(draft);
            }}
          >
            Save agent
          </button>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-4">
          {[
            ["Balance", bal ? `${Number(formatEther(bal.value)).toFixed(4)} MON` : "—"],
            ["Spent", `${spent.toFixed(3)} MON`],
            ["Earned", "0.00 MON"],
            ["Transactions", String(txCount)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-[#3a1a14] bg-black/30 p-4">
              <div className="text-xs text-[#b08978]">{k}</div>
              <div className="mono text-lg">{v}</div>
            </div>
          ))}
          <p className="sm:col-span-4 text-xs text-[#b08978]">
            {policy.name} · max {policy.maxPerTaskMon} MON / task · approval above {policy.requireApprovalAboveMon} MON
          </p>
        </section>
      )}

      <section className="rounded-xl border border-[#3a1a14] p-5">
        <h2 className="mb-2 font-semibold">Task</h2>
        <textarea
          className="h-24 w-full rounded-md border border-[#3a1a14] bg-black/40 px-3 py-2 text-sm"
          value={task}
          onChange={(e) => setTask(e.target.value)}
        />
        <button
          className="mt-3 rounded-md bg-[#ff3b1f] px-4 py-2 text-sm font-semibold"
          disabled={!isConnected || !policy || busy || !contractsReady()}
          onClick={runTask}
        >
          {busy ? "Working…" : "Run agent"}
        </button>
        {error && <p className="mt-2 text-sm text-[#ff3b1f]">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Marketplace</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <article key={agent.id} className="rounded-xl border border-[#3a1a14] bg-black/30 p-4">
              <h3 className="font-semibold">{agent.name}</h3>
              <p className="mt-1 text-xs text-[#b08978]">{agent.capabilities}</p>
              <p className="mono mt-3 text-sm">{mon(agent.priceWei)} MON / task</p>
              <p className="text-xs text-[#b08978]">{agent.jobs.toString()} jobs on-chain</p>
              <button
                className="mt-3 w-full rounded-md border border-[#ff3b1f] px-3 py-1.5 text-sm"
                disabled={!isConnected || busy || !policy}
                onClick={() => hireOne(agent)}
              >
                Hire (live tx)
              </button>
            </article>
          ))}
        </div>
      </section>

      <Feed items={feed} />

      {answer && (
        <section className="rounded-xl border border-[#ffb020]/40 bg-black/40 p-5">
          <h2 className="mb-2 text-sm font-semibold text-[#ffb020]">Final answer</h2>
          <p className="whitespace-pre-wrap text-sm leading-6">{answer}</p>
        </section>
      )}
    </main>
  );
}
