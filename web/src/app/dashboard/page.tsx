"use client";

import { useEffect, useState } from "react";
import { monadTestnet } from "wagmi/chains";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { AppNav } from "@/components/AppNav";
import { ListAgent } from "@/components/ListAgent";
import { type AgentView, useCatalog } from "@/lib/catalog";
import { payAgent } from "@/lib/client-pay";
import { contractsReady, explorerTx } from "@/lib/contracts";
import { mon, shortHash } from "@/lib/format";
import { readApiJson } from "@/lib/http";
import { checkPolicy, loadPolicy } from "@/lib/policy";

type TileState = {
  status: "idle" | "running" | "done" | "error";
  label?: string;
  hash?: `0x${string}`;
  result?: string;
};

export default function MarketplacePage() {
  const { chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { agents, refetch } = useCatalog();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [states, setStates] = useState<Record<number, TileState>>({});
  const [autoPay, setAutoPay] = useState(false);

  useEffect(() => {
    loadPolicy();
    fetch("/api/pay")
      .then((r) => readApiJson<{ enabled?: boolean }>(r))
      .then((d) => setAutoPay(Boolean(d.enabled)))
      .catch(() => setAutoPay(false));
  }, []);

  async function hire(agent: AgentView) {
    const policy = loadPolicy();
    const cost = mon(agent.priceWei);
    const gate = checkPolicy(policy, cost, cost);
    if (!gate.ok) {
      setStates((s) => ({ ...s, [agent.id]: { status: "error", result: gate.reason } }));
      return;
    }
    setBusyId(agent.id);
    setStates((s) => ({ ...s, [agent.id]: { status: "running", label: "Paying…" } }));
    try {
      const hash = await payAgent({
        agentId: agent.id,
        priceWei: agent.priceWei,
        auto: gate.autoPay,
        agentPayEnabled: autoPay,
        publicClient,
        chainId,
        writeContractAsync,
      });
      setStates((s) => ({ ...s, [agent.id]: { status: "running", label: "Running…", hash } }));
      const run = await fetch(`/api/agents/${agent.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: hash, task: `Run ${agent.name}`, capabilities: agent.capabilities }),
      });
      const payload = await readApiJson<{ result?: string; error?: string }>(run);
      if (!run.ok) throw new Error(payload.error ?? "Hire failed");
      setStates((s) => ({
        ...s,
        [agent.id]: { status: "done", hash, result: payload.result ?? "Done." },
      }));
      await refetch();
    } catch (e) {
      setStates((s) => ({
        ...s,
        [agent.id]: { status: "error", result: e instanceof Error ? e.message : "Hire failed" },
      }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <div className="mx-auto w-full max-w-5xl px-5 py-6">
        <AppNav current="market" />

        <div className="mt-10 mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.16em] text-[#5a6170]">MARKETPLACE</p>
            <h1 className="display text-4xl">Agents & APIs</h1>
          </div>
          <ListAgent onListed={() => void refetch()} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => {
            const state = states[agent.id];
            return (
              <article key={agent.id} className="flex flex-col border border-[#e2e5ec] bg-white p-4 shadow-[inset_3px_0_0_#c41e3a]">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-medium">{agent.name}</h2>
                  <span className="mono text-xs text-[#c41e3a]">{mon(agent.priceWei)} MON</span>
                </div>
                <p className="mt-2 flex-1 text-sm leading-6 text-[#5a6170]">{agent.capabilities}</p>
                <p className="mt-3 text-[11px] text-[#5a6170]">{agent.jobs.toString()} jobs</p>
                <button
                  className="mt-3 w-full rounded-md border border-[#c41e3a] px-3 py-2 text-sm text-[#c41e3a]"
                  disabled={busyId != null || !contractsReady()}
                  onClick={() => void hire(agent)}
                >
                  {state?.status === "running" ? state.label ?? "Working" : "Hire"}
                </button>
                {state?.hash && (
                  <a className="mono mt-2 text-[11px] text-[#1f4b99] underline" href={explorerTx(state.hash)} target="_blank" rel="noreferrer">
                    {shortHash(state.hash)}
                  </a>
                )}
                {state?.result && (
                  <p className={`mt-2 text-xs leading-5 ${state.status === "error" ? "text-[#c41e3a]" : "text-[#14161c]"}`}>
                    {state.result}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
