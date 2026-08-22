import { NextResponse } from "next/server";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { fail, readBody } from "@/lib/http";
import { agentCreditsAbi } from "@/lib/abi";
import { AGENT_CREDITS, RPC_URL, withGasBuffer } from "@/lib/contracts";
import { publicClient } from "@/lib/server-chain";
import type { Voucher } from "@/lib/voucher";

/**
 * Submits a user-signed spend voucher on their behalf.
 *
 * This endpoint deliberately holds no spending authority. The operator key pays
 * gas only; the funds come from the caller's own credit balance, and the amount
 * and expiry are fixed by a signature the contract verifies. That is why the
 * route needs no session or login: an unauthenticated request can at worst
 * replay a voucher the user already signed, bounded by its own cap.
 */
function operatorAccount() {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) return null;
  const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  return privateKeyToAccount(pk);
}

export async function GET() {
  try {
    const account = operatorAccount();
    if (!account || !AGENT_CREDITS) return NextResponse.json({ enabled: false });
    const gasBalance = await publicClient.getBalance({ address: account.address });
    return NextResponse.json({
      enabled: true,
      operator: account.address,
      credits: AGENT_CREDITS,
      // Gas only. This wallet never funds a hire.
      gasBalance: gasBalance.toString(),
    });
  } catch (e) {
    return fail(e, "Could not read operator wallet");
  }
}

export async function POST(req: Request) {
  try {
    const account = operatorAccount();
    if (!account) {
      return NextResponse.json({ error: "Operator wallet not configured" }, { status: 503 });
    }
    if (!AGENT_CREDITS) {
      return NextResponse.json({ error: "Credits contract not configured" }, { status: 503 });
    }

    const body = await readBody<{
      voucher?: Voucher;
      signature?: `0x${string}`;
      agentId?: number;
    }>(req);

    const { voucher, signature, agentId } = body;
    if (!voucher || !signature || !agentId) {
      return NextResponse.json({ error: "voucher, signature and agentId required" }, { status: 400 });
    }

    const tuple = {
      user: voucher.user,
      maxSpendWei: BigInt(voucher.maxSpendWei),
      epoch: BigInt(voucher.epoch),
      deadline: BigInt(voucher.deadline),
    } as const;

    // Simulate first so a rejected voucher comes back as a clean message
    // instead of a burnt-gas revert the user has to decode. Monad charges on the
    // gas limit, so the estimate doubles as the limit we actually send.
    let gas: bigint;
    try {
      await publicClient.simulateContract({
        address: AGENT_CREDITS,
        abi: agentCreditsAbi,
        functionName: "spend",
        args: [tuple, signature, BigInt(agentId)],
        account: account.address,
      });
      gas = withGasBuffer(
        await publicClient.estimateContractGas({
          address: AGENT_CREDITS,
          abi: agentCreditsAbi,
          functionName: "spend",
          args: [tuple, signature, BigInt(agentId)],
          account: account.address,
        }),
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      const known = ["VoucherExpired", "VoucherStale", "VoucherCapReached", "BadSignature"].find((n) =>
        raw.includes(n),
      );
      if (known) {
        return NextResponse.json({ error: `Voucher rejected (${known})` }, { status: 400 });
      }
      if (raw.includes("InsufficientCredits")) {
        return NextResponse.json({ error: "Not enough credits. Top up in Settings." }, { status: 402 });
      }
      return fail(e, "Hire could not be paid");
    }

    const wallet = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(RPC_URL),
    });

    const hash = await wallet.writeContract({
      address: AGENT_CREDITS,
      abi: agentCreditsAbi,
      functionName: "spend",
      args: [tuple, signature, BigInt(agentId)],
      gas,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return NextResponse.json({ error: "Payment reverted" }, { status: 502 });
    }

    return NextResponse.json({ hash, from: voucher.user });
  } catch (e) {
    return fail(e, "Credit spend failed");
  }
}
