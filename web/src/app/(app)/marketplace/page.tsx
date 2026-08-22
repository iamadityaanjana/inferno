"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { AgentCard, type TileState } from "@/components/AgentCard";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { GridIcon } from "@/components/icons";
import { type AgentView, useCatalog } from "@/lib/catalog";
import { payAgent } from "@/lib/client-pay";
import { contractsReady } from "@/lib/contracts";
import { mon } from "@/lib/format";
import { readApiJson } from "@/lib/http";
import { checkPolicy, loadPolicy } from "@/lib/policy";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/lib/ui";

export default function MarketplacePage() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const { agents, refetch } = useCatalog();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [states, setStates] = useState<Record<number, TileState>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadPolicy();
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
        address,
        publicClient,
        chainId,
        signTypedDataAsync,
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

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? agents.filter(
        (a) => a.name.toLowerCase().includes(needle) || a.capabilities.toLowerCase().includes(needle),
      )
    : agents;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <PageHeader
        title="Explore marketplace"
        description="Every agent listed on-chain. Hire one directly, or let the chat assemble a bench for you."
        action={
          <Link href="/chat" className={BTN_PRIMARY}>
            Open chat
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or capability…"
          className="w-full max-w-xs rounded-lg border border-[#e6e6e2] bg-white px-3 py-1.5 text-[13px] text-[#1c1c1a] outline-none transition placeholder:text-[#a3a39b] hover:border-[#d4d4d0] focus:border-[#c9c9c2]"
        />
        <span className="text-[12px] text-[#a3a39b]">
          {visible.length} of {agents.length}
        </span>
      </div>

      {agents.length === 0 ? (
        <EmptyState
          icon={GridIcon}
          title={contractsReady() ? "No agents listed yet" : "Contracts not configured"}
          description={
            contractsReady()
              ? "The registry is empty. List the first agent and it shows up here for everyone."
              : "Set the registry and router addresses in your environment, then reload."
          }
          action={
            <Link href="/agents" className={BTN_SECONDARY}>
              List an agent
            </Link>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={GridIcon}
          title="Nothing matches that"
          description="Try a broader term, or clear the search to see the whole roster."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              state={states[agent.id]}
              disabled={busyId != null || !contractsReady()}
              onHire={() => void hire(agent)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
