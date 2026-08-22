import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { monadTestnet } from "viem/chains";
import { AGENT_CREDITS, PAYMENT_ROUTER, REGISTRY, RPC_URL } from "./contracts";
import { paymentRouterAbi, registryAbi } from "./abi";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(RPC_URL),
});

/**
 * Every registered agent name mapped to its id, read from the registry.
 *
 * The chain is the only durable record of what has been published — serverless
 * hosts give us no writable disk — so this is what "is it listed already?" has
 * to be answered from. Cached briefly because it costs one call per agent.
 */
export type RegistryNames = {
  names: Map<string, number>;
  /**
   * False when any read failed. Callers deciding whether something is already
   * registered MUST refuse to act on an incomplete map — a throttled read looks
   * exactly like an absent agent, and acting on that registers duplicates.
   */
  complete: boolean;
};

const nameCache: { at: number; value: RegistryNames } = {
  at: 0,
  value: { names: new Map(), complete: false },
};
const NAME_TTL_MS = 30_000;

/** The public RPC throttles bursts, so read in small chunks and retry once. */
async function readAgent(id: number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await publicClient.readContract({
        address: REGISTRY,
        abi: registryAbi,
        functionName: "getAgent",
        args: [BigInt(id)],
      });
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
    }
  }
  return null;
}

export async function readRegistryNames(): Promise<RegistryNames> {
  if (Date.now() - nameCache.at < NAME_TTL_MS && nameCache.value.complete) return nameCache.value;
  if (!REGISTRY) return { names: new Map(), complete: false };
  try {
    const count = await publicClient.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "agentCount",
    });
    const ids = Array.from({ length: Number(count) }, (_, i) => i + 1);
    const names = new Map<string, number>();
    let complete = true;

    for (let i = 0; i < ids.length; i += 4) {
      const chunk = ids.slice(i, i + 4);
      const agents = await Promise.all(chunk.map(readAgent));
      agents.forEach((agent, j) => {
        if (!agent) {
          complete = false;
          return;
        }
        // First registration of a name wins, so a later duplicate cannot hijack it.
        if (agent.name && !names.has(agent.name.toLowerCase())) names.set(agent.name.toLowerCase(), chunk[j]);
      });
    }

    const result = { names, complete };
    if (complete) {
      nameCache.at = Date.now();
      nameCache.value = result;
    }
    return result;
  } catch {
    return { names: nameCache.value.names, complete: false };
  }
}

/**
 * The registry name, straight from the chain. Used to bind a paid hire back to
 * its data source without trusting the client or a local file.
 */
export async function readAgentName(agentId: number) {
  if (!REGISTRY || agentId < 1) return null;
  try {
    const agent = await publicClient.readContract({
      address: REGISTRY,
      abi: registryAbi,
      functionName: "getAgent",
      args: [BigInt(agentId)],
    });
    return agent.name || null;
  } catch {
    return null;
  }
}

const paymentEvent = parseAbiItem(
  "event Payment(address indexed from, address indexed to, uint256 indexed agentId, uint256 amount)",
);

export async function assertPaid(txHash: `0x${string}`, agentId: number) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    confirmations: 1,
    pollingInterval: 400,
    timeout: 90_000,
  });
  if (receipt.status !== "success") {
    throw new Error("Transaction failed on-chain");
  }
  // A credit-funded hire is sent to AgentCredits, which calls the router
  // internally, so the Payment log below is the real proof either way.
  const allowedTo = [PAYMENT_ROUTER, AGENT_CREDITS].filter(Boolean).map((a) => a.toLowerCase());
  if (!receipt.to || !allowedTo.includes(receipt.to.toLowerCase())) {
    throw new Error("Tx was not sent to PaymentRouter or AgentCredits");
  }
  let matched = false;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== PAYMENT_ROUTER.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: paymentRouterAbi,
        eventName: "Payment",
        data: log.data,
        topics: log.topics,
      });
      if (Number(decoded.args.agentId) === agentId) {
        matched = true;
        break;
      }
    } catch {
      // not our event
    }
  }
  if (!matched) {
    throw new Error(`No Payment event for agent ${agentId} in ${txHash}`);
  }
  return receipt;
}

export { paymentEvent };
