"use client";

import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { AgentCard, type TileState } from "@/components/AgentCard";
import { AppNav } from "@/components/AppNav";
import { ListAgent } from "@/components/ListAgent";
import { type AgentView, useCatalog } from "@/lib/catalog";
import { payAgent } from "@/lib/client-pay";
import { contractsReady } from "@/lib/contracts";
import { mon } from "@/lib/format";
import { readApiJson } from "@/lib/http";
import { checkPolicy, loadPolicy } from "@/lib/policy";

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
    setStates((s) => ({ ...s, [agent.id]: { status: "running", label: "Hiring…" } }));
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
    <div className="min-h-screen bg-[#eef0f5]">
      <div className="mx-auto w-full max-w-6xl px-6 py-7">
        <AppNav current="market" />

        <div className="mt-12 mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] text-[#9AA1AD]">Marketplace</p>
            <h1 className="display mt-1 text-[42px] leading-none">Agents & APIs</h1>
          </div>
          <ListAgent onListed={() => void refetch()} />
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              state={states[agent.id]}
              disabled={busyId != null || !contractsReady()}
              onHire={() => void hire(agent)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
