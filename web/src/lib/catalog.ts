"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { registryAbi } from "./abi";
import { REGISTRY, contractsReady } from "./contracts";

export type AgentView = {
  id: number;
  name: string;
  capabilities: string;
  priceWei: bigint;
  jobs: bigint;
  active: boolean;
};

export function useCatalog() {
  const { data: count, refetch: refetchCount } = useReadContract({
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

  async function refetch() {
    await refetchCount();
    await refetchAgents();
  }

  return { agents, refetch };
}
