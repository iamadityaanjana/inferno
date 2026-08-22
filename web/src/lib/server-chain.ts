import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { monadTestnet } from "viem/chains";
import { PAYMENT_ROUTER, RPC_URL } from "./contracts";
import { paymentRouterAbi } from "./abi";

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(RPC_URL),
});

const paymentEvent = parseAbiItem(
  "event Payment(address indexed from, address indexed to, uint256 indexed agentId, uint256 amount)",
);

export async function assertPaid(txHash: `0x${string}`, agentId: number) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
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
