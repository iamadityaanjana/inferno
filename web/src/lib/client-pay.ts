import { readApiJson } from "./http";
import { paymentRouterAbi } from "./abi";
import { PAY_GAS, PAYMENT_ROUTER } from "./contracts";
import { addDailySpend } from "./policy";
import { mon } from "./format";
import { monadTestnet } from "wagmi/chains";
import type { PublicClient } from "viem";

export async function payAgent(opts: {
  agentId: number;
  priceWei: bigint;
  auto: boolean;
  agentPayEnabled: boolean;
  publicClient?: PublicClient;
  chainId?: number;
  writeContractAsync: (args: {
    address: `0x${string}`;
    abi: typeof paymentRouterAbi;
    functionName: "pay";
    args: [bigint];
    value: bigint;
    gas: bigint;
    chainId: number;
  }) => Promise<`0x${string}`>;
}) {
  const cost = mon(opts.priceWei);
  if (opts.auto && opts.agentPayEnabled) {
    const res = await fetch("/api/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: opts.agentId, priceWei: opts.priceWei.toString() }),
    });
    const data = await readApiJson<{ hash?: `0x${string}`; error?: string }>(res);
    if (!res.ok || !data.hash) throw new Error(data.error ?? "Payment failed");
    addDailySpend(cost);
    return data.hash;
  }
  if (!opts.publicClient) throw new Error("Connect a wallet");
  if (opts.chainId !== monadTestnet.id) throw new Error("Switch to Monad Testnet");
  const hash = await opts.writeContractAsync({
    address: PAYMENT_ROUTER,
    abi: paymentRouterAbi,
    functionName: "pay",
    args: [BigInt(opts.agentId)],
    value: opts.priceWei,
    gas: PAY_GAS,
    chainId: monadTestnet.id,
  });
  const receipt = await opts.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Payment reverted");
  addDailySpend(cost);
  return hash;
}
