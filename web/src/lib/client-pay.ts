import { readApiJson } from "./http";
import { agentCreditsAbi, paymentRouterAbi } from "./abi";
import { AGENT_CREDITS, PAY_GAS, PAYMENT_ROUTER, creditsReady } from "./contracts";
import { addDailySpend } from "./policy";
import { mon } from "./format";
import { monadTestnet } from "wagmi/chains";
import {
  buildVoucher,
  clearSignedVoucher,
  isUsable,
  loadSignedVoucher,
  saveSignedVoucher,
  toTypedMessage,
  VOUCHER_TYPES,
  voucherDomain,
  type SignedVoucher,
} from "./voucher";
import type { PublicClient } from "viem";

export type SignTypedData = (args: {
  domain: ReturnType<typeof voucherDomain>;
  types: typeof VOUCHER_TYPES;
  primaryType: "SpendVoucher";
  message: ReturnType<typeof toTypedMessage>;
}) => Promise<`0x${string}`>;

/**
 * Returns a signed voucher for this session, prompting for a signature only
 * when there isn't a live one. The on-chain epoch is the source of truth, so a
 * voucher the user revoked is never reused.
 */
export async function ensureVoucher(opts: {
  address: `0x${string}`;
  publicClient: PublicClient;
  signTypedDataAsync: SignTypedData;
}): Promise<SignedVoucher> {
  const epoch = await opts.publicClient.readContract({
    address: AGENT_CREDITS,
    abi: agentCreditsAbi,
    functionName: "epochOf",
    args: [opts.address],
  });
  const now = BigInt(Math.floor(Date.now() / 1000));

  const cached = loadSignedVoucher(opts.address);
  if (cached && isUsable(cached, epoch, now)) return cached;

  const voucher = buildVoucher(opts.address, epoch, now);
  const signature = await opts.signTypedDataAsync({
    domain: voucherDomain(),
    types: VOUCHER_TYPES,
    primaryType: "SpendVoucher",
    message: toTypedMessage(voucher),
  });
  const signed = { voucher, signature };
  saveSignedVoucher(signed);
  return signed;
}

export async function creditBalance(publicClient: PublicClient, address: `0x${string}`) {
  return publicClient.readContract({
    address: AGENT_CREDITS,
    abi: agentCreditsAbi,
    functionName: "credits",
    args: [address],
  });
}

/**
 * Pays for one hire. Prefers the prepaid-credit path so a multi-agent task needs
 * a single signature; falls back to a direct wallet transaction when credits are
 * unavailable or the balance has run out.
 */
export async function payAgent(opts: {
  agentId: number;
  priceWei: bigint;
  address?: `0x${string}`;
  publicClient?: PublicClient;
  chainId?: number;
  signTypedDataAsync?: SignTypedData;
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

  if (creditsReady() && opts.address && opts.publicClient && opts.signTypedDataAsync) {
    const balance = await creditBalance(opts.publicClient, opts.address);
    if (balance >= opts.priceWei) {
      // One retry: an exhausted or revoked voucher is fixed by signing a fresh
      // one, so only give up on the credit path after that also fails.
      for (let attempt = 0; attempt < 2; attempt++) {
        const signed = await ensureVoucher({
          address: opts.address,
          publicClient: opts.publicClient,
          signTypedDataAsync: opts.signTypedDataAsync,
        });
        const res = await fetch("/api/pay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...signed, agentId: opts.agentId }),
        });
        const data = await readApiJson<{ hash?: `0x${string}`; error?: string }>(res);
        if (res.ok && data.hash) {
          addDailySpend(cost);
          return data.hash;
        }
        const recoverable = /voucher/i.test(data.error ?? "");
        if (!recoverable) throw new Error(data.error ?? "Payment failed");
        clearSignedVoucher();
      }
    }
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
