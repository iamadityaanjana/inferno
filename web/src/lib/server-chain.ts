import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { monadTestnet } from "viem/chains";
import { PAYMENT_ROUTER, REGISTRY, RPC_URL } from "./contracts";
import { paymentRouterAbi, registryAbi } from "./abi";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(RPC_URL),
});

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
  if (receipt.to?.toLowerCase() !== PAYMENT_ROUTER.toLowerCase()) {
    throw new Error("Tx was not sent to PaymentRouter");
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
